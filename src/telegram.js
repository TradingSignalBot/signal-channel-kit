// @ts-check
// The Telegram Bot API over fetch: no library.

export class TelegramError extends Error {
  /** @param {string} method @param {number} code @param {string} description */
  constructor(method, code, description) {
    super(`${method}: ${description}`);
    this.code = code;
    this.description = description;
  }
}

/** @typedef {{ call: (method: string, params?: Record<string, unknown>) => Promise<any> }} Telegram */

/**
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {Telegram}
 */
export function telegram(token, fetchImpl = fetch) {
  return {
    async call(method, params = {}) {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(method === 'getUpdates' ? 60_000 : 20_000),
      });
      const body = /** @type {any} */ (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` })));
      if (!body.ok) throw new TelegramError(method, body.error_code ?? res.status, body.description ?? 'failed');
      return body.result;
    },
  };
}

/** @param {unknown} err */
export const isNotFound = (err) =>
  err instanceof TelegramError && /not found|message_id_invalid|can't be edited|message to edit/i.test(err.description);

/** @param {unknown} err */
export const isNotModified = (err) => err instanceof TelegramError && /not modified/i.test(err.description);
