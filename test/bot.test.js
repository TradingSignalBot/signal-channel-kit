import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bot } from '../src/bot.js';
import { memoryStore } from '../src/store.js';
import { TelegramError } from '../src/telegram.js';
import { readAlert, sameSecret } from '../src/webhook.js';

/** A Telegram that keeps what it is sent. `fail` decides which calls fail. */
function fakeTelegram(fail = () => null) {
  const calls = [];
  let id = 500;
  return {
    calls,
    async call(method, params = {}) {
      calls.push({ method, params });
      const err = fail(method, params);
      if (err) throw new TelegramError(method, 400, err);
      if (method === 'sendMessage') return { message_id: ++id };
      return true;
    },
  };
}

const config = {
  channel: '@mychannel',
  admins: new Set([42]),
  style: { timeZone: 'UTC', riskLine: 'Not financial advice.', credit: true },
};
const admin = { by: '42 Ann', source: 'telegram', userId: 42 };
const now = () => new Date('2026-11-02T14:05:00Z');

async function setup(fail) {
  const telegram = fakeTelegram(fail);
  const store = memoryStore();
  const bot = await new Bot({ telegram, store, config, now, log: () => {} }).init();
  return { bot, telegram, store };
}

test('posts a signal, pins the record, then replies in the thread', async () => {
  const { bot, telegram, store } = await setup();
  assert.equal(await bot.handleText('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910', admin), 'Posted signal #1 to the channel.');
  const [post, record, pin] = telegram.calls;
  assert.equal(post.params.chat_id, '@mychannel');
  assert.match(post.params.text, /^EURUSD BUY · signal #1\n\nEntry 1\.0850\nStop 1\.0820 \(-30 pips\)\nTP1 1\.0880 \(\+30 pips\)\nTP2 1\.0910 \(\+60 pips\)/);
  assert.match(post.params.text, /Posted 2 Nov 2026, 14:05 UTC\nNot financial advice\.$/);
  assert.match(record.params.text, /1 signal: 0 won, 0 lost, 0 breakeven, 1 open\./);
  assert.equal(pin.method, 'pinChatMessage');

  await bot.handleText('/hit tp1', admin);
  const reply = telegram.calls.find((c) => c.method === 'sendMessage' && c.params.reply_parameters);
  assert.equal(reply.params.reply_parameters.message_id, 501);
  assert.equal(reply.params.text, '#1 EURUSD buy: TP1 reached at 1.0880 (+30 pips).');
  assert.equal(telegram.calls.at(-1).method, 'editMessageText');

  assert.equal(await bot.handleText('/stop', admin), 'Signal #1: Closed · TP1, then the stop.');
  assert.match(telegram.calls.at(-1).params.text, /1 signal: 0 won, 1 lost, 0 breakeven, 0 open\./);
  assert.deepEqual(store.events.map((e) => e.t), ['signal', 'pinned', 'hit', 'stop']);
});

test('only admins post', async () => {
  const { bot, telegram } = await setup();
  const reply = await bot.handleText('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880', { by: '7', source: 'telegram', userId: 7 });
  assert.match(reply, /Only this channel's admins/);
  assert.equal(telegram.calls.length, 0);
  assert.match(await bot.handleText('/whoami', { by: '7', source: 'telegram', userId: 7 }), /Your Telegram id is 7/);
  assert.match(await bot.handleText('/help', { by: '7', source: 'telegram', userId: 7 }), /tradingsignalbot\.com\/telegram-signal-bot\/\?via=channel-kit/);
});

test('a signal Telegram refuses is not counted', async () => {
  const { bot, store } = await setup((method) => (method === 'sendMessage' ? 'Forbidden: bot is not a member' : null));
  const reply = await bot.handleText('EURUSD buy 1.0850 sl 1.0820 tp 1.0880', { by: 'tradingview', source: 'tradingview' });
  assert.match(reply, /Nothing was posted or counted/);
  assert.equal(store.events.length, 0);
});

test('a deleted signal message is logged and the signal still counts', async () => {
  let deleted = false;
  const { bot, telegram, store } = await setup((method, p) =>
    deleted && method === 'sendMessage' && p.reply_parameters ? 'Bad Request: message to be replied not found' : null);
  await bot.handleText('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880', admin);
  deleted = true;
  assert.equal(await bot.handleText('/hit tp1', admin), 'Signal #1: Closed · the target.');
  assert.deepEqual(store.events.map((e) => e.t), ['signal', 'pinned', 'deleted', 'hit']);
  assert.match(telegram.calls.at(-1).params.text, /0 messages edited, 1 found deleted\. All still counted\./);
  assert.match(telegram.calls.at(-1).params.text, /1 signal: 1 won/);
});

test('an edit in the channel is logged', async () => {
  const { bot, store } = await setup();
  await bot.handleText('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880', admin);
  await bot.handleUpdate({ edited_channel_post: { chat: { id: -100, username: 'MyChannel' }, message_id: 501, text: 'EURUSD BUY, better entry' } });
  await bot.handleUpdate({ edited_channel_post: { chat: { id: -100, username: 'MyChannel' }, message_id: 999, text: 'not ours' } });
  assert.deepEqual(store.events.filter((e) => e.t === 'edited').map((e) => [e.id, e.messageId]), [[1, 501]]);
  assert.equal(bot.state.edits, 1);
});

test('refusals do not change the record', async () => {
  const { bot, store } = await setup();
  assert.match(await bot.handleText('/hit tp1', admin), /no open signal/);
  await bot.handleText('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910', admin);
  await bot.handleText('/signal GBPUSD sell 1.2700 sl 1.2740 tp 1.2650', admin);
  assert.match(await bot.handleText('/stop', admin), /2 open signals/);
  assert.match(await bot.handleText('/hit tp3 #1', admin), /targets TP1 to TP2/);
  assert.match(await bot.handleText('/close', admin), /At what price/);
  assert.equal(await bot.handleText('/close 1.2680 GBPUSD', admin), 'Signal #2: Closed in profit at 1.2680.');
  assert.match(await bot.handleText('/close 1.2600 #2', admin), /already closed/);
  assert.equal(store.events.filter((e) => e.t !== 'pinned').length, 3);
});

test('two alerts at once get different numbers', async () => {
  const { bot } = await setup();
  const tv = { by: 'tradingview', source: 'tradingview' };
  const replies = await Promise.all([
    bot.handleText('EURUSD buy 1.0850 sl 1.0820 tp 1.0880', tv),
    bot.handleText('GBPUSD buy 1.2700 sl 1.2660 tp 1.2750', tv),
  ]);
  assert.deepEqual(replies, ['Posted signal #1 to the channel.', 'Posted signal #2 to the channel.']);
});

test('the record is reposted when its message is gone', async () => {
  let gone = false;
  const { bot, store } = await setup((method) => (gone && method === 'editMessageText' ? 'Bad Request: message to edit not found' : null));
  await bot.handleText('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880', admin);
  gone = true;
  await bot.handleText('/record', admin);
  assert.equal(store.events.filter((e) => e.t === 'pinned').length, 2);
});

test('reads TradingView alerts', () => {
  assert.deepEqual(readAlert('EURUSD buy 1.0850 sl 1.0820 tp 1.0880\nhit tp1 GBPUSD'), {
    secret: null, lines: ['EURUSD buy 1.0850 sl 1.0820 tp 1.0880', 'hit tp1 GBPUSD'],
  });
  assert.deepEqual(readAlert('{"secret":"s","text":"close 1.0862 EURUSD"}'), { secret: 's', lines: ['close 1.0862 EURUSD'] });
  assert.deepEqual(readAlert('{"secret":"s","symbol":"FX:EURUSD","side":"buy","entry":1.085,"sl":1.082,"tp":[1.088,1.091]}'), {
    secret: 's', lines: ['FX:EURUSD buy 1.085 sl 1.082 tp 1.088 1.091'],
  });
  assert.equal(sameSecret('a-long-shared-secret', 'a-long-shared-secret'), true);
  assert.equal(sameSecret('a-long-shared-secret', 'a-long-shared-secreT'), false);
});
