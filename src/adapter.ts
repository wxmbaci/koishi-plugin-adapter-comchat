import {
  Adapter,
  Awaitable,
  Logger,
  makeArray,
  MaybeArray,
  Session,
} from 'koishi';
import type WechatyBot from './index';
import { DefinePlugin, InjectLogger, Reusable } from 'koishi-thirdeye';
import { PassthroughEvents } from './def';
import type { WechatyEventListeners } from 'wechaty/src/schemas/mod';
import { adaptContact, adaptMessage, adaptRoom } from './utils';
import type { ContactInterface } from 'wechaty/src/user-modules/contact';

@Reusable()
@DefinePlugin()
export class WechatyAdapter extends Adapter.Client<WechatyBot> {
  @InjectLogger()
  private logger: Logger;

  private adaptEvent<K extends keyof WechatyEventListeners>(
    event: K,
    sessionBuilder: (
      ...args: Parameters<WechatyEventListeners[K]>
    ) => Awaitable<MaybeArray<Partial<Session>>>,
  ) {
    this.bot.internal.on(event, async (...args: any[]) => {
      const timestamp = Date.now();
      const payloads = makeArray(
        await sessionBuilder(...(args as Parameters<WechatyEventListeners[K]>)),
      );
      payloads.forEach((payload) => {
        if (!payload) return;
        payload.timestamp ??= timestamp;
        const session = this.bot.session(payload);
        this.bot.dispatch(session);
      });
    });
  }

  private loadEvents() {
    this.adaptEvent('message', async (message) => {
      const adaptedMessage = await adaptMessage(this.bot, message);
      if (!adaptedMessage) return;
      return {
        ...adaptedMessage,
        type:
          message.type() === this.bot.internal.Message.Type.Recalled
            ? 'message-deleted'
            : adaptedMessage.userId === this.bot.selfId
            ? 'message-sent'
            : 'message',
        subsubtype: adaptedMessage.subtype,
      };
    });
    this.adaptEvent('friendship', async (friendship) => {
      const wechatyType = friendship.type();
      let type: string;
      if (wechatyType === 2) {
        // receive
        type = 'friend-request';
      } else if (wechatyType === 1) {
        // confirm
        type = 'friend-added';
      } else {
        return;
      }
      return {
        type,
        messageId: friendship.id,
        content: friendship.hello(),
        channelId: 'private:' + friendship.contact().id,
        ...(await adaptContact(friendship.contact())),
      };
    });
    this.adaptEvent('room-invite', async (invitation) => {
      const channelName = await invitation.topic();
      return {
        type: 'guild-request',
        messageId: invitation.id,
        ...(await adaptContact(await invitation.inviter())),
        channelName,
        channelId: channelName,
        guildName: channelName,
        guildId: channelName,
      };
    });
    this.adaptEvent(
      'room-join',
      async (
        room,
        inviteeList: ContactInterface[],
        inviter: ContactInterface,
        date: Date,
      ) => {
        const channel = await adaptRoom(room);
        const timestamp = (date || new Date()).valueOf();
        const sessions = await Promise.all(
          inviteeList.map(async (invitee): Promise<Partial<Session>> => {
            const invitedUser = await adaptContact(invitee);
            return {
              type: invitee.self() ? 'guild-added' : 'guild-member-added',
              subtype: invitedUser.userId === inviter.id ? 'active' : 'passive',
              ...invitedUser,
              targetId: invitedUser.userId,
            };
          }),
        );
        return sessions.map((s) => ({
          operatorId: inviter.id,
          timestamp,
          ...channel,
          ...s,
        }));
      },
    );
    this.adaptEvent(
      'room-leave',
      async (
        room,
        leaverList: ContactInterface[],
        operator: ContactInterface,
        date: Date,
      ) => {
        const channel = await adaptRoom(room);
        const timestamp = (date || new Date()).valueOf();
        const sessions = await Promise.all(
          leaverList.map(async (leaver): Promise<Partial<Session>> => {
            const user = await adaptContact(leaver);
            return {
              type: leaver.self() ? 'guild-deleted' : 'guild-member-deleted',
              subtype:
                !operator || user.userId === operator.id ? 'active' : 'passive',
              targetId: user.userId,
              ...user,
            };
          }),
        );
        return sessions.map((s) => ({
          ...channel,
          operatorId: operator?.id,
          timestamp,
          ...s,
        }));
      },
    );
  }

  async start() {
    for (const event of PassthroughEvents) {
      this.bot.internal.on(event, (...args: any[]) => {
        const session = this.bot.session();
        session.type = `wechaty/${event}`;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        session.app.emit(session, `wechaty/${event}`, session, ...args);
      });
    }
    this.loadEvents();
    return this.bot.initialize();
  }
  async stop() {
    await this.bot.internal.stop();
  }
}
