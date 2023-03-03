import {
  DefinePlugin,
  InjectLogger,
  PluginDef,
  PluginSchema,
  RegisterSchema,
  Reusable,
  SchemaProperty,
  UsePlugin,
} from 'koishi-thirdeye';
import { Bot, Fragment, Logger, Schema, segment, SendOptions } from 'koishi';
import { WechatyBuilder, WechatyOptions } from 'wechaty';
import { WechatyEvents, WechatyInstance } from './def';
import { WechatyAdapter } from './adapter';
import { adaptContact, adaptMessage, adaptRoom, fileBoxToUrl } from './utils';
import { WechatyMessenger } from './message';
import qrcodeTerminal from 'qrcode-terminal';
import os from 'os';

declare module 'koishi' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Events extends WechatyEvents {}
}

@RegisterSchema()
export class WechatyBotConfig {
  @SchemaProperty({ required: true, description: 'Wechaty 配置文件保存路径。' })
  name: string;

  @SchemaProperty({
    default: 'wechaty-puppet-wechat',
    description: 'Wechaty 使用的 Puppet。',
    hidden: os.platform() !== 'win32',
    type: process.env.KOISHI_AGENT?.includes('Desktop')
      ? Schema.union([
          'wechaty-puppet-wechat',
          ...(os.platform() === 'win32' ? ['wechaty-puppet-xp'] : []),
        ])
      : String,
  })
  puppet: string;

  @SchemaProperty({
    default: { uos: true },
    hidden: true,
    type: Schema.object({}),
    description: 'Wechaty Puppet 选项。',
  })
  puppetOptions: any;

  platform = 'wechaty';
  selfId?: string;
}

@Reusable()
@PluginSchema(WechatyBotConfig)
@DefinePlugin()
export default class WechatyBot extends Bot<
  Partial<WechatyBotConfig & WechatyOptions>
> {
  internal: WechatyInstance;

  @InjectLogger()
  logger: Logger;

  @UsePlugin()
  loadAdapter() {
    this.internal = WechatyBuilder.build(this.config as any);
    return PluginDef(WechatyAdapter, this);
  }

  async initialize() {
    this.internal.on('login', async (user) => {
      this.selfId = user.id;
      this.username = user.name();
      this.avatar = await fileBoxToUrl(await user.avatar());
      this.online();
    });
    this.internal.on('logout', () => {
      this.offline();
    });
    this.internal.on('error', (error) => {
      this.offline(error);
    });
    this.internal.on('scan', (qrcode, status) => {
      qrcodeTerminal.generate(qrcode, { small: false }, (img) =>
        this.logger.info(
          `Scan (${status}): https://wechaty.js.org/qrcode/${encodeURIComponent(
            qrcode,
          )}\n` + img,
        ),
      );
    });
    await this.internal.start();
  }

  // message
  async sendMessage(
    channelId: string,
    content: Fragment,
    guildId?: string,
    options?: SendOptions,
  ) {
    return new WechatyMessenger(this, channelId, guildId, options).send(
      content,
    );
  }

  async sendPrivateMessage(
    userId: string,
    content: Fragment,
    options?: SendOptions,
  ) {
    return new WechatyMessenger(
      this,
      'private:' + userId,
      undefined,
      options,
    ).send(content);
  }
  async getMessage(channelId: string, messageId: string) {
    const message = await this.internal.Message.find({ id: messageId });
    if (!message) return;
    return adaptMessage(this, message as any);
  }
  async getMessageList(channelId: string, before?: string) {
    const messages = await this.internal.Message.findAll({
      roomId: !channelId.startsWith('private:') ? channelId : undefined,
      fromId: channelId.startsWith('private:') ? channelId.slice(8) : undefined,
    });
    return Promise.all(messages.map((m) => adaptMessage(this, m as any)));
  }
  async editMessage(
    channelId: string,
    messageId: string,
    content: segment.Fragment,
  ) {}
  async deleteMessage(channelId: string, messageId: string) {}

  // user
  async getSelf() {
    const self = this.internal.currentUser;
    return adaptContact(self);
  }
  async getUser(userId: string) {
    const contact = await this.internal.Contact.find({ id: userId });
    return adaptContact(contact);
  }
  async getFriendList() {
    const friends = await this.internal.Contact.findAll();
    return Promise.all(friends.map(adaptContact));
  }
  async deleteFriend(userId: string) {}

  // guild
  async getGuild(guildId: string) {
    const room = await this.internal.Room.find({ id: guildId });
    return adaptRoom(room);
  }
  async getGuildList() {
    const rooms = await this.internal.Room.findAll();
    return Promise.all(rooms.map(adaptRoom));
  }
  async getChannel(channelId: string) {
    return this.getGuild(channelId);
  }
  async getChannelList() {
    return this.getGuildList();
  }
  async muteChannel(channelId: string, guildId?: string, enable?: boolean) {}

  // guild member
  async getGuildMember(guildId: string, userId: string) {
    const room = await this.internal.Room.find({ id: guildId });
    if (!room) return;
    const members = await room.memberAll();
    const member = members.find((m) => m.id === userId);
    if (!member) return;
    return adaptContact(member);
  }
  async getGuildMemberList(guildId: string) {
    const room = await this.internal.Room.find({ id: guildId });
    if (!room) return;
    const members = await room.memberAll();
    return Promise.all(members.map(adaptContact));
  }
  async kickGuildMember(guildId: string, userId: string, permanent?: boolean) {}
  async muteGuildMember(
    guildId: string,
    userId: string,
    duration: number,
    reason?: string,
  ) {}

  // request
  async handleFriendRequest(
    messageId: string,
    approve: boolean,
    comment?: string,
  ) {
    if (!approve) return;
    return this.internal.Friendship.load(messageId).accept();
  }
  async handleGuildRequest(
    messageId: string,
    approve: boolean,
    comment?: string,
  ) {
    if (!approve) return;
    return this.internal.RoomInvitation.load(messageId).accept();
  }
  async handleGuildMemberRequest(
    messageId: string,
    approve: boolean,
    comment?: string,
  ) {}
}
