// @ts-check
// Pip sizes, the way TradingSignalBot counts them (tradingsignalbot.com/how-we-count/):
// four decimals on a currency pair, two when the yen is in it, and on gold one dollar is one pip.
// Anything else (indices, crypto, shares) is counted in points of 1, unless PIP_SIZES says otherwise.

const CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'NOK', 'SEK', 'DKK', 'PLN', 'HUF', 'CZK',
  'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNH', 'CNY', 'ILS', 'THB', 'INR', 'KRW', 'BRL',
]);

/** @type {Record<string, number>} */
let overrides = {};

/**
 * Set pip sizes for symbols the defaults get wrong, from "US30=1,BTCUSD=1,XAGUSD=0.01".
 * @param {string | undefined} spec
 */
export function setPipSizes(spec) {
  overrides = {};
  for (const part of (spec ?? '').split(',')) {
    const [sym, size] = part.split('=').map((x) => x?.trim());
    if (sym && size && Number(size) > 0) overrides[sym.toUpperCase()] = Number(size);
  }
}

/** @param {string} symbol */
export function isCurrencyPair(symbol) {
  return /^[A-Z]{6}$/.test(symbol) && CURRENCIES.has(symbol.slice(0, 3)) && CURRENCIES.has(symbol.slice(3));
}

/** @param {string} symbol */
export function pipSize(symbol) {
  if (overrides[symbol]) return overrides[symbol];
  if (symbol.startsWith('XAU')) return 1;
  if (symbol.startsWith('XAG')) return 0.01;
  if (isCurrencyPair(symbol)) return symbol.includes('JPY') ? 0.01 : 0.0001;
  return 1;
}

/** @param {string} symbol */
export function pipUnit(symbol) {
  return symbol.startsWith('XAU') || symbol.startsWith('XAG') || isCurrencyPair(symbol) ? 'pips' : 'points';
}

/** Rounded to a tenth. @param {number} x */
export function round1(x) {
  const r = Math.round(x * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Signed distance in pips from the entry, positive when in the trade's favour.
 * @param {{symbol: string, side: 'buy' | 'sell', entry: number}} s
 * @param {number} price
 */
export function pipsFrom(s, price) {
  const dir = s.side === 'buy' ? 1 : -1;
  return round1(((price - s.entry) * dir) / pipSize(s.symbol));
}

/** "+30", "-12.5", "0". @param {number} p */
export function signed(p) {
  const text = Number.isInteger(p) ? String(Math.abs(p)) : Math.abs(p).toFixed(1);
  return p > 0 ? `+${text}` : p < 0 ? `-${text}` : '0';
}
