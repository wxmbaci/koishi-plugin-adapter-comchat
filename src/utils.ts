import { segment, Universal, Element, Awaitable } from 'koishi';
import { ContactInterface } from 'wechaty/src/user-modules/contact';
import { RoomInterface } from 'wechaty/src/user-modules/room';
import { MessageInterface } from 'wechaty/src/user-modules/message';
import WechatyBot from './index';
import FileType from 'file-type';

export type ContactLike = Pick<
  ContactInterface,
  'id' | 'name' | 'avatar' | 'self'
>;
export type FileBoxLike = Awaited<ReturnType<ContactLike['avatar']>>;
import { FileBox } from 'file-box';
import path from 'path';
export type RoomLike = Pick<RoomInterface, 'id' | 'topic'>;
export type MessageLike = MessageInterface;

export const fileBoxToUrl = async (file: FileBoxLike): Promise<string> => {
  if (!file) {
    return undefined;
  }
  if (file['remoteUrl']) {
    return file['remoteUrl'];
  }
  let buf: Buffer;
  try {
    buf = await file.toBuffer();
  } catch (e) {
    buf = file['stream'];
  }
  return `base64://${buf.toString('base64')}`;
};

export const adaptContact = async (
  contact: ContactLike,
): Promise<Universal.User> => {
  return {
    userId: contact.id,
    nickname: contact.name(),
    avatar: await fileBoxToUrl(await contact.avatar()),
    isBot: contact.self(),
  };
};

export const adaptRoom = async (
  room: RoomLike,
): Promise<Universal.Channel & Universal.Guild> => {
  const name = await room.topic();
  return {
    channelId: room.id,
    channelName: name,
    guildId: room.id,
    guildName: name,
  };
};

async function extractMessageURL(
  message: MessageLike,
  segmentFactory: (url: string, name: string) => Awaitable<Element>,
): Promise<Element> {
  const file = await message.toFileBox();
  if (!file) {
    return;
  }
  return segmentFactory(await fileBoxToUrl(file), file.name);
}

export async function messageToElement(
  bot: WechatyBot,
  message: MessageLike,
): Promise<Element[]> {
  try {
    const MessageType = bot.internal.Message.Type;
    const elements: Element[] = [];
    const mentions = await message.mentionList();
    switch (message.type()) {
      case MessageType.Recalled:
        return [];
      case MessageType.Text:
        let text = message.text();
        for (const mention of mentions) {
          const name = mention.name();
          console.log('mention', name);
          text = text.replace(new RegExp(`@${name}\\s+`, 'g'), '');
        }
        console.log(text);
        elements.push(segment.text(text));
        break;
      case MessageType.Image:
        elements.push(
          await extractMessageURL(message, async (url, name) =>
            segment.image(url, { file: await autoFilename(url) }),
          ),
        );
        break;
      case MessageType.Audio:
        elements.push(
          await extractMessageURL(message, async (url, name) =>
            segment.audio(url, { file: await autoFilename(url) }),
          ),
        );
        break;
      case MessageType.Video:
        elements.push(
          await extractMessageURL(message, async (url, name) =>
            segment.video(url, { file: await autoFilename(url) }),
          ),
        );
        break;
      case MessageType.Attachment:
        elements.push(
          await extractMessageURL(message, async (url, name) =>
            segment.file(url, { file: name }),
          ),
        );
        break;
      case MessageType.Url:
        const link = await message.toUrlLink();
        elements.push(
          segment('a', { href: link.url() }, [
            link.title() + '\n' + link.description,
            segment.image(link.thumbnailUrl()),
          ]),
        );
        break;
      case MessageType.Contact:
        const contact = await message.toContact();
        elements.push(
          segment('wechaty:contact', { id: contact.id, name: contact.name() }),
        );
        break;
      default:
        return;
    }
    mentions.forEach((mention) => elements.unshift(segment.at(mention.id)));
    return elements;
  } catch (e) {
    return;
  }
}

export async function adaptMessage(
  bot: WechatyBot,
  message: MessageLike,
): Promise<Universal.Message> {
  const elements = await messageToElement(bot, message);
  if (!elements) return;
  const room = message.room();
  const from = message.talker();
  if (!from) {
    return;
  }
  const author = await adaptContact(from);
  const channel = room ? await adaptRoom(room) : {};
  const subtype = room ? 'group' : 'private';
  return {
    messageId: message.id,
    author,
    ...author,
    ...channel,
    channelId: room?.id || 'private:' + author.userId,
    subtype,
    elements,
    content: elements.map((e) => e.toString()).join(''),
    timestamp: (message.date() || new Date()).valueOf(),
  };
}

export async function autoFilename(url: string) {
  if (url.startsWith('file://')) {
    return path.basename(url.slice(7));
  }
  if (url.startsWith('base64://')) {
    const buf = Buffer.from(url.slice(9), 'base64');
    const type = await FileType.fromBuffer(buf);
    return `file.${type.ext}`;
  }
  return path.basename(new URL(url).pathname);
}

export const elementToFileBox = async (element: Element) => {
  const { attrs } = element;
  const { url, file } = attrs;
  if (!url) return;
  if (url.startsWith('file://')) {
    const filePath = url.slice(7);
    return FileBox.fromFile(filePath, file || (await autoFilename(url)));
  }
  if (url.startsWith('base64://')) {
    return FileBox.fromBase64(url.slice(9), file || (await autoFilename(url)));
  }
  return FileBox.fromUrl(url, {
    name: file || (await autoFilename(url)),
  });
};
