// @ts-check
// The record. Every change is an event appended to a log that is never rewritten; the state, the
// pinned message and the counts are all replayed from it. Nothing is deleted.
//
// How a signal is counted (the same rules as tradingsignalbot.com/how-we-count/, for a whole position):
// - A signal ends at its last target, at its stop, or when an admin closes it at a price.
// - Win: it closed at the last target, or was closed at a price in profit.
// - Loss: it closed at the stop, or was closed at a price at a loss. A signal that reached a target and
//   then the stop is a loss, shown as "TP1, then the stop", so it never reads as a clean win.
// - Breakeven: it closed at the entry: the stop after it was moved to the entry (a move posted in the
//   channel), or closed at the entry price.
// - Open: still running; the furthest target so far is named.
// - The levels are never changed after posting. A wrong signal is closed and a new one posted: both count.
// - Edits made to the bot's messages in the channel, and messages found deleted, are logged and counted.
// - Pips are shown per signal and never added up: past signals do not tell you what the next one will do.

import { pipsFrom, pipUnit, signed } from './pips.js';

/** @typedef {import('./parse.js').Side} Side */
/**
 * @typedef {{ t: 'signal', id: number, at: string, by: string, source: string, symbol: string, side: Side,
 *     entry: number, sl: number, tps: number[], digits: number, note: string | null, messageId: number }
 *   | { t: 'hit', id: number, at: string, by: string, tp: number, messageId: number }
 *   | { t: 'be', id: number, at: string, by: string, messageId: number }
 *   | { t: 'stop', id: number, at: string, by: string, price: number, messageId: number }
 *   | { t: 'close', id: number, at: string, by: string, price: number, messageId: number }
 *   | { t: 'edited', at: string, id: number | null, messageId: number, text: string }
 *   | { t: 'deleted', at: string, id: number, messageId: number }
 *   | { t: 'pinned', at: string, messageId: number }} Event
 */
/**
 * @typedef {object} Signal
 * @property {number} id
 * @property {string} at
 * @property {string} by
 * @property {string} source
 * @property {string} symbol
 * @property {Side} side
 * @property {number} entry
 * @property {number} sl      the stop as posted
 * @property {number} stop    the stop now (the entry after a posted move)
 * @property {number[]} tps
 * @property {number} digits
 * @property {string | null} note
 * @property {number} messageId
 * @property {number[]} messages  every channel message about it
 * @property {number} furthest    the furthest target reached, 0 for none
 * @property {string | null} beAt
 * @property {{ at: string, price: number, reason: 'targets' | 'stop' | 'close' } | null} closed
 * @property {number} edited
 * @property {boolean} deleted
 */
/**
 * @typedef {object} State
 * @property {Map<number, Signal>} signals
 * @property {number} nextId
 * @property {number | null} pinnedId
 * @property {number} edits
 * @property {number} deletions
 * @property {string | null} since
 */
/** @typedef {'open' | 'win' | 'loss' | 'breakeven'} Result */

/** A reason a command was not carried out, for whoever sent it. */
export class Refusal extends Error {}

/** @returns {State} */
export function emptyState() {
  return { signals: new Map(), nextId: 1, pinnedId: null, edits: 0, deletions: 0, since: null };
}

/** @param {State} state @param {number} id */
function need(state, id) {
  const s = state.signals.get(id);
  if (!s) throw new Error(`The log names signal #${id}, which it never posted.`);
  return s;
}

/** Apply one event. @param {State} state @param {Event} e */
export function apply(state, e) {
  switch (e.t) {
    case 'signal':
      state.signals.set(e.id, {
        id: e.id, at: e.at, by: e.by, source: e.source, symbol: e.symbol, side: e.side,
        entry: e.entry, sl: e.sl, stop: e.sl, tps: e.tps, digits: e.digits, note: e.note ?? null,
        messageId: e.messageId, messages: [e.messageId], furthest: 0, beAt: null, closed: null,
        edited: 0, deleted: false,
      });
      state.nextId = Math.max(state.nextId, e.id + 1);
      state.since ??= e.at;
      break;
    case 'hit': {
      const s = need(state, e.id);
      s.furthest = e.tp;
      s.messages.push(e.messageId);
      if (e.tp === s.tps.length) s.closed = { at: e.at, price: s.tps[e.tp - 1], reason: 'targets' };
      break;
    }
    case 'be': {
      const s = need(state, e.id);
      s.stop = s.entry;
      s.beAt = e.at;
      s.messages.push(e.messageId);
      break;
    }
    case 'stop': {
      const s = need(state, e.id);
      s.closed = { at: e.at, price: e.price, reason: 'stop' };
      s.messages.push(e.messageId);
      break;
    }
    case 'close': {
      const s = need(state, e.id);
      s.closed = { at: e.at, price: e.price, reason: 'close' };
      s.messages.push(e.messageId);
      break;
    }
    case 'edited':
      state.edits++;
      if (e.id !== null) need(state, e.id).edited++;
      break;
    case 'deleted':
      state.deletions++;
      need(state, e.id).deleted = true;
      break;
    case 'pinned':
      state.pinnedId = e.messageId;
      break;
  }
  return state;
}

/** @param {Event[]} events */
export function replay(events) {
  const state = emptyState();
  for (const e of events) apply(state, e);
  return state;
}

/** A price with the signal's decimals. @param {Signal} s @param {number} p */
export function fmt(s, p) {
  return p.toFixed(s.digits);
}

/**
 * Why this change cannot be made, or null when it can.
 * @param {Signal} s
 * @param {{ cmd: 'hit', tp: number } | { cmd: 'be' | 'stop' } | { cmd: 'close', price: number }} change
 */
export function problemWith(s, change) {
  if (s.closed) return `Signal #${s.id} is already closed (${outcome(s).label}).`;
  switch (change.cmd) {
    case 'hit':
      if (change.tp < 1 || change.tp > s.tps.length) {
        return `Signal #${s.id} has ${s.tps.length === 1 ? 'one target' : `targets TP1 to TP${s.tps.length}`}.`;
      }
      if (change.tp <= s.furthest) return `TP${s.furthest} is already marked on #${s.id}.`;
      return null;
    case 'be':
      return s.stop === s.entry ? `The stop on #${s.id} is already at the entry.` : null;
    case 'close':
      return change.price > 0 ? null : 'The price must be above zero.';
    default:
      return null;
  }
}

/**
 * What a signal is on the record.
 * @param {Signal} s
 * @returns {{ result: Result, label: string, pips: number | null }}
 */
export function outcome(s) {
  if (!s.closed) {
    return {
      result: 'open',
      label: s.furthest ? `Open · TP${s.furthest} reached so far` : 'Open · no target yet',
      pips: null,
    };
  }
  const pips = pipsFrom(s, s.closed.price);
  /** @type {Result} */
  const result = pips === 0 ? 'breakeven' : pips > 0 ? 'win' : 'loss';
  const f = s.furthest;
  let label;
  if (s.closed.reason === 'targets') {
    label = s.tps.length === 1 ? 'Closed · the target' : `Closed · all ${s.tps.length} targets`;
  } else if (s.closed.reason === 'stop') {
    if (result === 'breakeven') label = f ? `Closed · TP${f}, then the stop at the entry` : 'Closed · the stop at the entry';
    else if (result === 'loss') label = f ? `Closed · TP${f}, then the stop` : 'Closed · stopped before TP1';
    else label = 'Closed · the stop';
  } else {
    const how = result === 'win' ? 'in profit' : result === 'loss' ? 'at a loss' : 'at the entry';
    label = `Closed ${how} at ${fmt(s, s.closed.price)}${f ? `, after TP${f}` : ''}`;
  }
  return { result, label, pips };
}

/** @param {State} state */
export function tally(state) {
  const c = { total: 0, open: 0, win: 0, loss: 0, breakeven: 0, lossAfterTarget: 0 };
  for (const s of state.signals.values()) {
    const o = outcome(s);
    c.total++;
    c[o.result]++;
    if (o.result === 'loss' && s.furthest > 0) c.lossAfterTarget++;
  }
  return c;
}

/**
 * The signal a command is about: by #id, by pair, or the only open one.
 * @param {State} state
 * @param {import('./parse.js').Select} select
 * @returns {Signal}
 */
export function pick(state, select) {
  if (select.id !== undefined) {
    const s = state.signals.get(select.id);
    if (!s) throw new Refusal(`There is no signal #${select.id}.`);
    return s;
  }
  const open = [...state.signals.values()].filter((s) => !s.closed && (!select.symbol || s.symbol === select.symbol));
  if (open.length === 1) return open[0];
  const what = select.symbol ? `${select.symbol} signal` : 'signal';
  if (open.length === 0) throw new Refusal(`There is no open ${what}.`);
  throw new Refusal(`${open.length} open ${what}s: say which with #id (${open.map((s) => `#${s.id} ${s.symbol}`).join(', ')}).`);
}

/** "#12 EURUSD buy" @param {Signal} s */
export function nameOf(s) {
  return `#${s.id} ${s.symbol} ${s.side}`;
}

/** @param {number} p @param {Signal} s */
export function pipsText(p, s) {
  return `${signed(p)} ${pipUnit(s.symbol)}`;
}
