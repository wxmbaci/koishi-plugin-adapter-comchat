import { App, segment } from 'koishi';
import TargetPlugin from '../src';
import * as Help from '@koishijs/plugin-help';
import ExtrasInDev from './extras';
import fs from 'fs';

const app = new App({
  prefix: '.',
});

app.plugin(Help);

// Some extras
app.plugin(ExtrasInDev);

// Target plugin
app.plugin(TargetPlugin, {
  name: 'puppet-wechat',
});

app.on('bot-status-updated', (bot) =>
  console.log(
    `Bot ${bot.sid} ${bot.username} ${bot.avatar?.length} status updated: ${bot.status}`,
  ),
);
app.on('message', (session) =>
  console.log(`Got message from ${session.channelId}: ${session.content}`),
);
app.on('message-deleted', (session) =>
  console.log(`Message deleted from ${session.channelId}.`),
);
app
  .command('atme')
  .action(({ session }) => [segment.at(session.userId), '您好']);

app
  .command('image')
  .action(async () =>
    segment.image(
      await fs.promises.readFile(__dirname + '/10000.jpg'),
      'image/jpeg',
    ),
  );

app
  .command('you')
  .action(async ({ session }) =>
    console.log(await session.bot.getUser(session.userId)),
  );
app
  .command('me')
  .action(async ({ session }) => console.log(await session.bot.getSelf()));

app.on('guild-added', (session) =>
  console.log(`Guild added: ${session.guildId}`),
);

app.start();
