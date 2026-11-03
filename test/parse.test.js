import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParseError, normalizeSymbol, parseCommand, parseSignal } from '../src/parse.js';
import { pipSize, pipsFrom, setPipSizes } from '../src/pips.js';

test('reads the documented signal command', () => {
  const s = parseSignal('/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910');
  assert.deepEqual(s, { symbol: 'EURUSD', side: 'buy', entry: 1.085, sl: 1.082, tps: [1.088, 1.091], digits: 4, note: null });
});

test('reads words in any order, with @, TP1/TP2, commas and a note', () => {
  const s = parseSignal('signal sell FX:GBP/USD @1.2700 TP1 1.2650, TP2 1.2600 SL 1.2740 note London breakout, retest');
  assert.equal(s.symbol, 'GBPUSD');
  assert.equal(s.side, 'sell');
  assert.equal(s.entry, 1.27);
  assert.equal(s.sl, 1.274);
  assert.deepEqual(s.tps, [1.265, 1.26]);
  assert.equal(s.note, 'London breakout, retest');
});

test('long and short, broker suffixes, gold', () => {
  assert.equal(parseSignal('XAUUSD long 2400 sl 2385 tp 2430').side, 'buy');
  assert.equal(normalizeSymbol('OANDA:EURUSD.m'), 'EURUSD');
  assert.equal(parseSignal('usdjpy short 150.20 stop 150.80 target 149.60').symbol, 'USDJPY');
});

test('refuses levels on the wrong side', () => {
  assert.throws(() => parseSignal('EURUSD buy 1.0850 sl 1.0870 tp 1.0900'), /stop goes below/);
  assert.throws(() => parseSignal('EURUSD sell 1.0850 sl 1.0870 tp 1.0900'), /TP1 must be below the entry/);
  assert.throws(() => parseSignal('EURUSD buy 1.0850 sl 1.0820 tp 1.0900 1.0880'), /TP2 must be above TP1/);
});

test('refuses what is missing or unclear', () => {
  assert.throws(() => parseSignal('buy 1.0850 sl 1.0820 tp 1.0880'), /Which market/);
  assert.throws(() => parseSignal('EURUSD 1.0850 sl 1.0820 tp 1.0880'), /Buy or sell/);
  assert.throws(() => parseSignal('EURUSD buy 1.0850 tp 1.0880'), /stop/);
  assert.throws(() => parseSignal('EURUSD buy 1.0850 sl 1.0820'), /target/);
  assert.throws(() => parseSignal('EURUSD buy 1.0850 1.0820'), /stop or a target/);
  assert.throws(() => parseSignal('EURUSD buy 1.0850 sl 1.0820 tp 1.0880 maybe'), ParseError);
});

test('reads the update commands', () => {
  assert.deepEqual(parseCommand('/hit tp1'), { cmd: 'hit', tp: 1, select: {} });
  assert.deepEqual(parseCommand('/hit@MyBot tp 2 #12'), { cmd: 'hit', tp: 2, select: { id: 12 } });
  assert.deepEqual(parseCommand('/stop EURUSD'), { cmd: 'stop', select: { symbol: 'EURUSD' } });
  assert.deepEqual(parseCommand('/be #3'), { cmd: 'be', select: { id: 3 } });
  assert.deepEqual(parseCommand('/close #4 1.08625'), { cmd: 'close', price: 1.08625, digits: 5, select: { id: 4 } });
  assert.deepEqual(parseCommand('close 1.0862 FX:EURUSD'), { cmd: 'close', price: 1.0862, digits: 4, select: { symbol: 'EURUSD' } });
  assert.equal(parseCommand('/record').cmd, 'record');
  assert.equal(parseCommand('EURUSD buy 1.0850 sl 1.0820 tp 1.0880').cmd, 'signal');
  assert.throws(() => parseCommand('/hit'), /Which target/);
  assert.throws(() => parseCommand('/close'), /At what price/);
  assert.throws(() => parseCommand('/delete 3'), /There is no \/delete/);
});

test('pips as TradingSignalBot counts them', () => {
  assert.equal(pipSize('EURUSD'), 0.0001);
  assert.equal(pipSize('USDJPY'), 0.01);
  assert.equal(pipSize('XAUUSD'), 1);
  assert.equal(pipsFrom({ symbol: 'EURUSD', side: 'buy', entry: 1.085 }, 1.088), 30);
  assert.equal(pipsFrom({ symbol: 'EURUSD', side: 'sell', entry: 1.085 }, 1.088), -30);
  assert.equal(pipsFrom({ symbol: 'USDJPY', side: 'sell', entry: 150.2 }, 149.6), 60);
  assert.equal(pipsFrom({ symbol: 'XAUUSD', side: 'buy', entry: 2400 }, 2385), -15);
  setPipSizes('US30=1,BTCUSD=10');
  assert.equal(pipSize('BTCUSD'), 10);
  setPipSizes('');
});
