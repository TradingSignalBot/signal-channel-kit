// @ts-check
// Settings from the environment, and from a .env file beside the code when there is one.

import { existsSync, readFileSync } from 'node:fs';

/** Read KEY=value lines into process.env, without overriding what is set. @param {string} file */
export function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export const DEFAULT_RISK_LINE =
  'Not financial advice. Trading on margin carries a high risk: you can lose more than you put in.';

/** @param {NodeJS.ProcessEnv} env */
export function configFrom(env) {
  /** @type {string[]} */
  const missing = [];
  /** @param {string} key */
  const need = (key) => {
    const v = env[key]?.trim();
    if (!v) missing.push(key);
    return v ?? '';
  };
  const token = need('BOT_TOKEN');
  const channel = need('CHANNEL_ID');
  const admins = new Set(
    need('ADMIN_IDS').split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0),
  );
  if (missing.length) throw new Error(`Set ${missing.join(', ')} (see .env.example).`);
  if (admins.size === 0) throw new Error('ADMIN_IDS has no Telegram user ids. Send /whoami to the bot to find yours.');

  const secret = env.WEBHOOK_SECRET?.trim() ?? '';
  if (secret && secret.length < 16) throw new Error('WEBHOOK_SECRET must be 16 characters or more.');
  const timeZone = env.TIME_ZONE?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
  } catch {
    throw new Error(`TIME_ZONE "${timeZone}" is not a time zone, like Europe/London or America/New_York.`);
  }
  return {
    token,
    channel,
    admins,
    dataDir: env.DATA_DIR?.trim() || './data',
    port: Number(env.PORT) || 8080,
    secret,
    pipSizes: env.PIP_SIZES ?? '',
    style: {
      timeZone,
      riskLine: env.RISK_LINE === undefined ? DEFAULT_RISK_LINE : env.RISK_LINE.trim(),
      credit: !/^(off|false|0|no)$/i.test(env.CREDIT ?? ''),
    },
  };
}
