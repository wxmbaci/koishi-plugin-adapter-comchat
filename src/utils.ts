import { Contact, Friendship, Message, Wechaty } from 'wechaty';
import PUPPET from 'wechaty-puppet';
import { Bot, segment, Session } from 'koishi';
import moment from 'moment';
import { FriendshipType } from 'wechaty-puppet/dist/cjs/src/schemas/friendship';

export const adaptContact = async (contact: Contact): Promise<Bot.User> => {
  const avatar = await contact.avatar();
  return {
    userId: contact.id,
    username: contact.name(),
    nickname: contact.name(),
    avatar: avatar && `base64://${await avatar.toBase64()}`,
  };
};

async function extractBuffer(
  message: Message,
  segmentFactory: (buffer: Buffer) => string,
): Promise<string> {
  const file = await message.toFileBox();
  if (!file) {
    return;
  }
  const buffer = await file.toBuffer();
  return segmentFactory(buffer);
}

export const adaptMessage = async (message: Message): Promise<Bot.Message> => {
  let content: string;
  switch (message.type()) {
    case PUPPET.types.Message.Text:
      const text = message.text();
      content = text.replace(
        /@([^\s]+)(\s?)/g,
        (_, name, suffix) => segment.at(name) + suffix,
      );
      break;
    case PUPPET.types.Message.Image:
      content = await extractBuffer(message, (b) => segment.image(b));
      break;
    case PUPPET.types.Message.Audio:
      content = await extractBuffer(message, (b) => segment.audio(b));
      break;
    case PUPPET.types.Message.Video:
      content = await extractBuffer(message, (b) => segment.video(b));
      break;
    case PUPPET.types.Message.Attachment:
      content = await extractBuffer(message, (b) => segment.file(b));
      break;
    case PUPPET.types.Message.Url:
      const url = await message.toUrlLink();
      content = segment('url', {
        url: url.url(),
        description: url.description(),
        thumb: url.thumbnailUrl(),
        title: url.title(),
        thumbnailUrl: url.thumbnailUrl(),
      });
    case PUPPET.types.Message.Contact:
      const contact = await message.toContact();
      content = segment('contact', {
        userId: contact.id,
        username: contact.name(),
        nickname: contact.name(),
      });
    default:
      return;
  }
  if (!content) {
    return;
  }
  const source = message.from();
  const room = message.room();
  const result: Bot.Message = {
    author: await adaptContact(source),
    userId: source.id,
    messageId: message.id,
    timestamp: moment(message.date()).unix() * 1000,
    content,
  };
  if (room) {
    result.guildId = result.channelId = room.id;
  }
  return result;
};

export const SessionFactory = {
  friendship: (friendship: Friendship): Partial<Session> => {
    const session: Partial<Session> = {};
    const from = friendship.contact();
    session.userId = from.id;
    session.messageId = friendship.id;
    switch (friendship.type()) {
      case FriendshipType.Receive:
        session.type = 'friend-request';
        break;
    }
    return session;
  },
};
