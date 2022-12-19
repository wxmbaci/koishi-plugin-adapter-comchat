import { WechatyBuilder } from 'wechaty';
import type { WechatyEventListeners } from 'wechaty/src/schemas/mod';
import WechatyBot from './index';
import { Session } from 'koishi';

export type WechatyInstance = ReturnType<typeof WechatyBuilder['build']>;

type AddSessionToFront<F> = F extends (...args: infer A) => infer P
  ? (session: Session & { bot: WechatyBot }, ...args: A) => P
  : never;
export const PassthroughEvents = [
  'scan',
  'room-topic',
  'heartbeat',
  'error',
] as const;
export type PassthroughEvents = typeof PassthroughEvents[number];
export type WechatyEvents = {
  [K in keyof WechatyEventListeners as `wechaty/${PassthroughEvents}`]: AddSessionToFront<
    WechatyEventListeners[K]
  >;
};
