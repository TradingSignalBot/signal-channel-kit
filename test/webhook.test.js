import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webhookServer } from '../src/webhook.js';

test('the webhook takes alerts with the secret and refuses the rest', async () => {
  const seen = [];
  const server = webhookServer({ secret: 'a-long-shared-secret', run: async (line) => { seen.push(line); return 'ok'; }, log: () => {} });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = (path, body) => fetch(base + path, { method: 'POST', body });
    assert.equal((await post('/tradingview', 'EURUSD buy 1.0850 sl 1.0820 tp 1.0880')).status, 401);
    assert.equal((await post('/tradingview?key=wrong', 'EURUSD buy 1.0850 sl 1.0820 tp 1.0880')).status, 401);
    const ok = await post('/tradingview?key=a-long-shared-secret', 'EURUSD buy 1.0850 sl 1.0820 tp 1.0880');
    assert.deepEqual(await ok.json(), { ok: true, results: ['ok'] });
    assert.equal((await post('/tradingview', '{"secret":"a-long-shared-secret","text":"hit tp1"}')).status, 200);
    assert.equal((await post('/tradingview?key=a-long-shared-secret', '   ')).status, 400);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.deepEqual(seen, ['EURUSD buy 1.0850 sl 1.0820 tp 1.0880', 'hit tp1']);
  } finally {
    server.close();
  }
});
