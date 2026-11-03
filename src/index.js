// @ts-check
// Start the bot: check its rights in the channel, listen for admins (long polling, no public address
// needed) and, when WEBHOOK_SECRET is set, for TradingView alerts on PORT.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Bot } from './bot.js';
import { configFrom, loadEnvFile } from './config.js';
import { setPipSizes } from './pips.js';
import { fileStore } from './store.js';
import { telegram } from './telegram.js';
import { webhookServer } from './webhook.js';
import { NETWORK_FOOTER, TSB_BOT } from './links.js';

loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));

let config;
try {
  config = configFrom(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
setPipSizes(config.pipSizes);

const tg = telegram(config.token);
const bot = await new Bot({ telegram: tg, store: fileStore(config.dataDir), config }).init();

const me = await tg.call('getMe');
console.log(`@${me.username} for ${config.channel}: ${bot.state.signals.size} signals on the record.`);

try {
  const member = await tg.call('getChatMember', { chat_id: config.channel, user_id: me.id });
  if (member.status !== 'administrator') {
    console.warn(`@${me.username} is not an admin of ${config.channel}. Add it as an admin who can post messages.`);
  } else {
    if (member.can_post_messages === false) console.warn('The bot cannot post messages in the channel: give it that right.');
    if (member.can_edit_messages === false) console.warn('Without "edit messages of others" the bot cannot pin the record.');
  }
} catch (err) {
  console.warn(`Could not check the channel (${err instanceof Error ? err.message : err}). Is CHANNEL_ID right?`);
}

await tg.call('deleteWebhook').catch(() => {});
await tg
  .call('setMyCommands', {
    commands: [
      ['signal', 'Post a signal: EURUSD buy 1.0850 sl 1.0820 tp 1.0880'],
      ['hit', 'A target was reached: tp1'],
      ['be', 'Move the stop to the entry'],
      ['stop', 'The stop was hit'],
      ['close', 'Closed at a price: 1.0862'],
      ['open', 'The open signals'],
      ['record', 'Refresh the pinned record'],
      ['help', 'How to use the bot'],
      ['whoami', 'Your Telegram id'],
    ].map(([command, description]) => ({ command, description })),
    scope: { type: 'all_private_chats' },
  })
  .catch(() => {});

if (config.secret) {
  webhookServer({
    secret: config.secret,
    run: (line) => bot.handleText(line, { by: 'tradingview', source: 'tradingview' }),
  }).listen(config.port, () => console.log(`TradingView alerts: POST /tradingview?key=... on port ${config.port}`));
} else {
  console.log('WEBHOOK_SECRET is not set: TradingView alerts are off.');
}

console.log(`${NETWORK_FOOTER}\nCharts drawn and redrawn at every target: ${TSB_BOT}`);

let offset = 0;
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; setTimeout(() => process.exit(0), 500); });

while (!stopping) {
  try {
    const updates = await tg.call('getUpdates', {
      offset, timeout: 30, allowed_updates: ['message', 'edited_channel_post'],
    });
    for (const u of updates) {
      offset = u.update_id + 1;
      await bot.handleUpdate(u).catch((err) => console.error(`Update ${u.update_id}: ${err instanceof Error ? err.message : err}`));
    }
  } catch (err) {
    console.error(`getUpdates: ${err instanceof Error ? err.message : err}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
