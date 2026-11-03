// @ts-check
// Reading what an admin (or a TradingView alert) sends.
//
//   /signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910 note London breakout
//   /hit tp1 [#12 | EURUSD]
//   /be [#12 | EURUSD]          move the stop to the entry
//   /stop [#12 | EURUSD]        the stop was hit
//   /close 1.0862 [#12 | EURUSD]
//   /open, /record, /help, /start, /whoami
//
// Prices use a dot for decimals. Words can come in any order: "buy EURUSD @1.0850 SL 1.0820 TP1 1.0880 TP2 1.0910".

/** @typedef {'buy' | 'sell'} Side */
/**
 * @typedef {object} SignalInput
 * @property {string} symbol
 * @property {Side} side
 * @property {number} entry
 * @property {number} sl
 * @property {number[]} tps
 * @property {number} digits  decimals to show prices with
 * @property {string | null} note
 */
/** @typedef {{ id?: number, symbol?: string }} Select */
/**
 * @typedef {{ cmd: 'signal', signal: SignalInput }
 *   | { cmd: 'hit', tp: number, select: Select }
 *   | { cmd: 'be' | 'stop', select: Select }
 *   | { cmd: 'close', price: number, digits: number, select: Select }
 *   | { cmd: 'open' | 'record' | 'help' | 'start' | 'whoami' }} Command
 */

export class ParseError extends Error {}

/** @type {Record<string, Side>} */
const SIDES = { buy: 'buy', long: 'buy', sell: 'sell', short: 'sell' };
const SL_WORDS = new Set(['sl', 'stop', 'stoploss', 's/l']);
const ENTRY_WORDS = new Set(['entry', 'at', '@', 'price', 'e']);
const MAX_TARGETS = 10;

/** "FX:EURUSD", "eur/usd", "EURUSD.m" -> "EURUSD". @param {string} raw */
export function normalizeSymbol(raw) {
  let s = raw.trim();
  if (s.includes(':')) s = s.slice(s.lastIndexOf(':') + 1);
  s = s.split('.')[0];
  return s.replace(/[/\-_\s]/g, '').toUpperCase();
}

/** @param {string} token */
function number(token) {
  const t = token.replace(/^@/, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const dot = t.indexOf('.');
  return { value: Number(t), digits: dot < 0 ? 0 : t.length - dot - 1 };
}

/** @param {string} text */
function tokens(text) {
  return text.trim().split(/[\s,=]+/).filter(Boolean);
}

/**
 * @param {string} text  the signal, with or without "/signal" in front
 * @returns {SignalInput}
 */
export function parseSignal(text) {
  let body = text.trim().replace(/^\/?signal(@\w+)?\b/i, '');
  /** @type {string | null} */
  let note = null;
  const noteAt = body.search(/(^|\s)note(\s|:)/i);
  if (noteAt >= 0) {
    note = body.slice(noteAt).replace(/^\s*note:?\s*/i, '').trim().slice(0, 300) || null;
    body = body.slice(0, noteAt);
  }

  /** @type {string | null} */ let symbol = null;
  /** @type {Side | null} */ let side = null;
  /** @type {number | null} */ let entry = null;
  /** @type {number | null} */ let sl = null;
  /** @type {number[]} */ const tps = [];
  let digits = 0;
  /** @type {'entry' | 'sl' | 'tp' | null} */ let mode = null;

  for (const tok of tokens(body)) {
    const low = tok.toLowerCase();
    const n = number(tok);
    if (n) {
      digits = Math.max(digits, n.digits);
      if (mode === 'sl') {
        if (sl !== null) throw new ParseError('Give one stop.');
        sl = n.value;
        mode = null;
      } else if (mode === 'tp') {
        tps.push(n.value);
      } else if (mode === 'entry' || entry === null) {
        if (entry !== null) throw new ParseError('Give one entry.');
        entry = n.value;
        mode = null;
      } else {
        throw new ParseError(`Is ${tok} the stop or a target? Put "sl" or "tp" before it.`);
      }
      continue;
    }
    if (SIDES[low]) {
      if (side) throw new ParseError('Say buy or sell once.');
      side = SIDES[low];
    } else if (SL_WORDS.has(low)) {
      mode = 'sl';
    } else if (/^(tp\d*|targets?|take)$/.test(low)) {
      mode = 'tp';
    } else if (ENTRY_WORDS.has(low)) {
      mode = 'entry';
    } else if (symbol === null && /^[a-z0-9:/._-]{3,24}$/i.test(tok) && /[a-z]/i.test(tok)) {
      symbol = normalizeSymbol(tok);
    } else {
      throw new ParseError(`I do not know "${tok}".`);
    }
  }

  if (!symbol) throw new ParseError('Which market? Start with the pair, like EURUSD.');
  if (!side) throw new ParseError('Buy or sell?');
  if (entry === null) throw new ParseError('What is the entry?');
  if (sl === null) throw new ParseError('Where is the stop? Add "sl" and a price.');
  if (tps.length === 0) throw new ParseError('Add at least one target: "tp" and a price.');
  if (tps.length > MAX_TARGETS) throw new ParseError(`${MAX_TARGETS} targets at most.`);

  const dir = side === 'buy' ? 1 : -1;
  if ((entry - sl) * dir <= 0) {
    throw new ParseError(`On a ${side} the stop goes ${side === 'buy' ? 'below' : 'above'} the entry.`);
  }
  let last = entry;
  for (const [i, tp] of tps.entries()) {
    if ((tp - last) * dir <= 0) {
      throw new ParseError(
        `TP${i + 1} must be ${side === 'buy' ? 'above' : 'below'} ${i === 0 ? 'the entry' : `TP${i}`}.`,
      );
    }
    last = tp;
  }
  return { symbol, side, entry, sl, tps, digits, note };
}

/** @param {string[]} toks @returns {Select} */
function selectFrom(toks) {
  /** @type {Select} */
  const select = {};
  for (const tok of toks) {
    const id = tok.match(/^#(\d+)$/);
    if (id) select.id = Number(id[1]);
    else if (/[a-z]/i.test(tok)) select.symbol = normalizeSymbol(tok);
    else throw new ParseError(`I do not know "${tok}". Use #id or the pair.`);
  }
  return select;
}

const COMMANDS = new Set(['signal', 'hit', 'be', 'breakeven', 'stop', 'sl', 'close', 'open', 'record', 'help', 'start', 'whoami']);

/**
 * One command. Text without a command word is read as a signal (that is what TradingView alerts send).
 * @param {string} text
 * @returns {Command}
 */
export function parseCommand(text) {
  const toks = tokens(text);
  if (toks.length === 0) throw new ParseError('Nothing to read.');
  const word = toks[0].replace(/^\//, '').replace(/@\w+$/, '').toLowerCase();
  if (!COMMANDS.has(word)) {
    if (toks[0].startsWith('/')) throw new ParseError(`There is no /${word}. Send /help for the list.`);
    return { cmd: 'signal', signal: parseSignal(text) };
  }
  const rest = toks.slice(1);
  switch (word) {
    case 'signal':
      return { cmd: 'signal', signal: parseSignal(text) };
    case 'hit': {
      let tp = 0;
      /** @type {string[]} */
      const others = [];
      for (let i = 0; i < rest.length; i++) {
        const m = rest[i].match(/^tp(\d+)$/i);
        if (m) tp = Number(m[1]);
        else if (/^(tp|target)$/i.test(rest[i]) && /^\d+$/.test(rest[i + 1] ?? '')) tp = Number(rest[++i]);
        else others.push(rest[i]);
      }
      if (!tp) throw new ParseError('Which target? Like /hit tp1.');
      return { cmd: 'hit', tp, select: selectFrom(others) };
    }
    case 'be':
    case 'breakeven':
      return { cmd: 'be', select: selectFrom(rest) };
    case 'stop':
    case 'sl':
      return { cmd: 'stop', select: selectFrom(rest) };
    case 'close': {
      /** @type {{value: number, digits: number} | null} */
      let price = null;
      /** @type {string[]} */
      const others = [];
      for (const tok of rest) {
        const n = number(tok);
        if (n && !price) price = n;
        else others.push(tok);
      }
      if (!price) throw new ParseError('At what price? Like /close 1.0862.');
      return { cmd: 'close', price: price.value, digits: price.digits, select: selectFrom(others) };
    }
    default:
      return { cmd: /** @type {'open' | 'record' | 'help' | 'start' | 'whoami'} */ (word) };
  }
}
