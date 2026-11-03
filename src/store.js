// @ts-check
// The log: one JSON event a line in <DATA_DIR>/events.jsonl, only ever appended to.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** @typedef {import('./record.js').Event} Event */
/** @typedef {{ load: () => Promise<Event[]>, append: (e: Event) => Promise<void> }} Store */

/** @param {string} dir @returns {Store} */
export function fileStore(dir) {
  const file = join(dir, 'events.jsonl');
  return {
    async load() {
      await mkdir(dir, { recursive: true });
      const text = await readFile(file, 'utf8').catch((err) => (err.code === 'ENOENT' ? '' : Promise.reject(err)));
      const lines = text.split('\n').filter((l) => l.trim());
      /** @type {Event[]} */
      const events = [];
      for (const [i, line] of lines.entries()) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // Only a last line cut short by a crash is skipped; anything else is a damaged log, and the bot stops.
          if (i === lines.length - 1) console.warn(`Skipping a half-written last line in ${file}`);
          else throw new Error(`${file}, line ${i + 1}, is not JSON. Fix it by hand before starting.`);
        }
      }
      return events;
    },
    async append(e) {
      await appendFile(file, `${JSON.stringify(e)}\n`, 'utf8');
    },
  };
}

/** For tests. @param {Event[]} [events] @returns {Store & { events: Event[] }} */
export function memoryStore(events = []) {
  return {
    events,
    async load() {
      return [...events];
    },
    async append(e) {
      events.push(JSON.parse(JSON.stringify(e)));
    },
  };
}
