import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcome, pick, problemWith, replay, tally } from '../src/record.js';
import { recordText } from '../src/format.js';

const at = '2026-11-02T14:05:00.000Z';
let mid = 100;
/** A signal event. */
const sig = (id, extra = {}) => ({
  t: 'signal', id, at, by: '1 Ann', source: 'telegram', symbol: 'EURUSD', side: 'buy',
  entry: 1.085, sl: 1.082, tps: [1.088, 1.091], digits: 4, note: null, messageId: mid++, ...extra,
});
const ev = (t, id, extra = {}) => ({ t, id, at, by: '1 Ann', messageId: mid++, ...extra });

test('every outcome is counted, losses included', () => {
  const state = replay([
    sig(1), ev('hit', 1, { tp: 1 }), ev('hit', 1, { tp: 2 }), // all targets: win
    sig(2), ev('stop', 2, { price: 1.082 }), // stopped before TP1: loss
    sig(3), ev('hit', 3, { tp: 1 }), ev('stop', 3, { price: 1.082 }), // TP1 then the stop: loss
    sig(4), ev('hit', 4, { tp: 1 }), ev('be', 4), ev('stop', 4, { price: 1.085 }), // stop at entry: breakeven
    sig(5), ev('close', 5, { price: 1.0862 }), // closed in profit: win
    sig(6), ev('close', 6, { price: 1.0841 }), // closed at a loss: loss
    sig(7), ev('close', 7, { price: 1.085 }), // closed at the entry: breakeven
    sig(8), ev('hit', 8, { tp: 1 }), // open
    sig(9), // open
  ]);
  assert.deepEqual(tally(state), { total: 9, open: 2, win: 2, loss: 3, breakeven: 2, lossAfterTarget: 1 });

  const label = (id) => outcome(state.signals.get(id)).label;
  assert.equal(label(1), 'Closed · all 2 targets');
  assert.equal(label(2), 'Closed · stopped before TP1');
  assert.equal(label(3), 'Closed · TP1, then the stop');
  assert.equal(label(4), 'Closed · TP1, then the stop at the entry');
  assert.equal(label(5), 'Closed in profit at 1.0862');
  assert.equal(label(6), 'Closed at a loss at 1.0841');
  assert.equal(label(7), 'Closed at the entry at 1.0850');
  assert.equal(label(8), 'Open · TP1 reached so far');
  assert.equal(label(9), 'Open · no target yet');
  assert.equal(outcome(state.signals.get(3)).pips, -30);
});

test('a target then the stop never reads as a win', () => {
  const state = replay([sig(1, { tps: [1.088, 1.091, 1.094] }), ev('hit', 1, { tp: 2 }), ev('stop', 1, { price: 1.082 })]);
  const o = outcome(state.signals.get(1));
  assert.equal(o.result, 'loss');
  assert.equal(o.label, 'Closed · TP2, then the stop');
});

test('a single target closes the signal', () => {
  const state = replay([sig(1, { tps: [1.088] }), ev('hit', 1, { tp: 1 })]);
  assert.deepEqual(outcome(state.signals.get(1)), { result: 'win', label: 'Closed · the target', pips: 30 });
});

test('sell signals count the other way', () => {
  const state = replay([
    sig(1, { side: 'sell', entry: 1.27, sl: 1.274, tps: [1.265] }), ev('close', 1, { price: 1.268 }),
  ]);
  assert.equal(outcome(state.signals.get(1)).result, 'win');
  assert.equal(outcome(state.signals.get(1)).pips, 20);
});

test('edits and deletions are counted and the signal still counts', () => {
  const state = replay([
    sig(1), { t: 'edited', at, id: 1, messageId: 100, text: 'changed' },
    { t: 'deleted', at, id: 1, messageId: 100 }, ev('stop', 1, { price: 1.082 }),
  ]);
  assert.equal(state.edits, 1);
  assert.equal(state.deletions, 1);
  assert.equal(tally(state).loss, 1);
  const text = recordText(state, { timeZone: 'UTC', riskLine: '', credit: false }, new Date(at));
  assert.match(text, /1 signal: 0 won, 1 lost, 0 breakeven, 0 open\./);
  assert.match(text, /1 message edited, 1 found deleted\. All still counted\./);
});

test('refuses changes that would rewrite the record', () => {
  const state = replay([sig(1), ev('hit', 1, { tp: 1 }), sig(2), ev('stop', 2, { price: 1.082 })]);
  const s1 = state.signals.get(1);
  assert.match(problemWith(s1, { cmd: 'hit', tp: 1 }), /already marked/);
  assert.match(problemWith(s1, { cmd: 'hit', tp: 3 }), /targets TP1 to TP2/);
  assert.equal(problemWith(s1, { cmd: 'hit', tp: 2 }), null);
  assert.match(problemWith(state.signals.get(2), { cmd: 'close', price: 1.09 }), /already closed/);
});

test('picks the signal a command is about', () => {
  const state = replay([sig(1), sig(2, { symbol: 'GBPUSD' }), sig(3), ev('stop', 3, { price: 1.082 })]);
  assert.equal(pick(state, { id: 3 }).id, 3);
  assert.equal(pick(state, { symbol: 'GBPUSD' }).id, 2);
  assert.equal(pick(state, { symbol: 'EURUSD' }).id, 1);
  assert.throws(() => pick(state, {}), /2 open signals: say which with #id \(#1 EURUSD, #2 GBPUSD\)/);
  assert.throws(() => pick(state, { symbol: 'USDJPY' }), /no open USDJPY signal/);
  assert.throws(() => pick(state, { id: 9 }), /no signal #9/);
});

test('the record lists the latest first and never totals pips', () => {
  const state = replay([sig(1), ev('hit', 1, { tp: 1 }), ev('stop', 1, { price: 1.082 }), sig(2)]);
  const text = recordText(state, { timeZone: 'UTC', riskLine: '', credit: true }, new Date(at));
  assert.match(text, /2 signals: 0 won, 1 lost, 0 breakeven, 1 open\./);
  assert.match(text, /1 of the losses reached a target first, then the stop\./);
  assert.ok(text.indexOf('#2 ') < text.indexOf('#1 '));
  assert.match(text, /#1 2 Nov EURUSD buy: Closed · TP1, then the stop \(-30 pips\)/);
  assert.match(text, /Pips are never added up/);
  assert.doesNotMatch(text, /total|win rate|%/i);
  assert.match(text, /github\.com\/TradingSignalBot\/signal-channel-kit/);
});
