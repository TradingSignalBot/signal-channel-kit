// @ts-check
// TradingView alerts. TradingView cannot send headers, so the shared secret travels in the address
// (POST /tradingview?key=SECRET) or in a JSON body ({"secret": "..."}).
//
// The alert message can be:
//   plain text:  EURUSD buy {{close}} sl 1.0820 tp 1.0880 1.0910      (or "hit tp1 EURUSD", "close {{close}} EURUSD")
//   JSON:        {"secret": "...", "text": "EURUSD buy {{close}} sl 1.0820 tp 1.0880"}
//   JSON fields: {"secret": "...", "symbol": "{{ticker}}", "side": "buy", "entry": {{close}}, "sl": 1.0820, "tp": [1.0880, 1.0910]}
// One command a line.

import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 16 * 1024;

/** @param {string} a @param {string} b */
export function sameSecret(a, b) {
  const h = (/** @type {string} */ x) => createHash('sha256').update(x).digest();
  return timingSafeEqual(h(a), h(b));
}

/**
 * The command lines and the secret in a request body.
 * @param {string} body
 * @returns {{ secret: string | null, lines: string[] }}
 */
export function readAlert(body) {
  /** @type {any} */
  let json = null;
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = null;
    }
  }
  if (!json || typeof json !== 'object') return { secret: null, lines: splitLines(trimmed) };
  const secret = typeof json.secret === 'string' ? json.secret : null;
  const text = json.text ?? json.message ?? json.command;
  if (typeof text === 'string') return { secret, lines: splitLines(text) };
  if (json.symbol && json.side) {
    const tps = Array.isArray(json.tp) ? json.tp : [json.tp ?? json.tp1, json.tp2, json.tp3, json.tp4].filter((x) => x != null);
    const parts = [json.symbol, json.side, json.entry, 'sl', json.sl, 'tp', ...tps];
    if (json.note) parts.push('note', json.note);
    return { secret, lines: [parts.join(' ')] };
  }
  return { secret, lines: [] };
}

/** @param {string} text */
function splitLines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * @param {{ secret: string, run: (line: string) => Promise<string>, log?: (msg: string) => void }} opts
 */
export function webhookServer({ secret, run, log = console.log }) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    /** @param {number} status @param {unknown} body */
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && url.pathname === '/healthz') return send(200, { ok: true });
    if (req.method !== 'POST' || url.pathname !== '/tradingview') return send(404, { ok: false, error: 'not found' });

    let body = '';
    let tooBig = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (tooBig) return send(413, { ok: false, error: 'too big' });
      const alert = readAlert(body);
      const given = url.searchParams.get('key') ?? alert.secret ?? '';
      if (!given || !sameSecret(given, secret)) {
        log('TradingView webhook: wrong or missing secret.');
        return send(401, { ok: false, error: 'wrong secret' });
      }
      if (alert.lines.length === 0) return send(400, { ok: false, error: 'no command in the alert' });
      /** @type {string[]} */
      const results = [];
      for (const line of alert.lines.slice(0, 10)) {
        const result = await run(line).catch((err) => `Failed: ${err instanceof Error ? err.message : err}`);
        log(`TradingView: ${line} -> ${result.split('\n')[0]}`);
        results.push(result);
      }
      send(200, { ok: true, results });
    });
  });
}
