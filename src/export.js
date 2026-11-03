// @ts-check
// The record as CSV, from the log: node src/export.js [data dir] > record.csv
// Publish it beside the channel if you like: it is every signal, with the losses.

import { fileStore } from './store.js';
import { outcome, replay } from './record.js';
import { setPipSizes } from './pips.js';

setPipSizes(process.env.PIP_SIZES);
const state = replay(await fileStore(process.argv[2] ?? process.env.DATA_DIR ?? './data').load());

/** @param {unknown} v */
const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const head = ['id', 'posted_at', 'symbol', 'side', 'entry', 'stop', 'targets', 'furthest_target', 'closed_at', 'exit', 'result', 'outcome', 'pips', 'edits', 'deleted'];
const rows = [...state.signals.values()].map((s) => {
  const o = outcome(s);
  return [
    s.id, s.at, s.symbol, s.side, s.entry, s.sl, s.tps.join(' '), s.furthest || '', s.closed?.at, s.closed?.price,
    o.result, o.label, o.pips, s.edited, s.deleted ? 'yes' : '',
  ];
});
process.stdout.write([head, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n');
