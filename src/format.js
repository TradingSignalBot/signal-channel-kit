// @ts-check
// The words the bot posts. Plain text only: no Markdown, so nothing in a note can break a message.

import { pipsFrom } from './pips.js';
import { fmt, nameOf, outcome, pipsText, tally } from './record.js';
import { HELP_LINKS, KIT_REPO, NETWORK_FOOTER } from './links.js';

/** @typedef {import('./record.js').Signal} Signal */
/** @typedef {import('./record.js').State} State */
/** @typedef {{ timeZone: string, riskLine: string, credit: boolean }} Style */

/** "2 Nov 2026, 14:05 UTC" @param {string} iso @param {string} timeZone */
export function when(iso, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  }).formatToParts(new Date(iso));
  /** @param {string} t */
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
}

/** "2 Nov" @param {string} iso @param {string} timeZone */
function day(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** The signal as it goes to the channel. @param {Signal} s @param {Style} style */
export function signalText(s, style) {
  const lines = [
    `${s.symbol} ${s.side.toUpperCase()} · signal #${s.id}`,
    '',
    `Entry ${fmt(s, s.entry)}`,
    `Stop ${fmt(s, s.sl)} (${pipsText(pipsFrom(s, s.sl), s)})`,
    ...s.tps.map((tp, i) => `TP${i + 1} ${fmt(s, tp)} (${pipsText(pipsFrom(s, tp), s)})`),
  ];
  if (s.note) lines.push('', s.note);
  lines.push('', `Posted ${when(s.at, style.timeZone)}`);
  if (style.riskLine) lines.push(style.riskLine);
  return lines.join('\n');
}

/** The reply in the signal's thread after a change. @param {Signal} s after the change @param {'hit' | 'be' | 'stop' | 'close'} what */
export function updateText(s, what) {
  const o = outcome(s);
  switch (what) {
    case 'hit': {
      const tp = s.tps[s.furthest - 1];
      const head = `${nameOf(s)}: TP${s.furthest} reached at ${fmt(s, tp)} (${pipsText(pipsFrom(s, tp), s)}).`;
      return s.closed ? `${head}\n${o.label}.` : head;
    }
    case 'be':
      return `${nameOf(s)}: the stop moves to the entry, ${fmt(s, s.entry)}. If it is hit now, the signal closes at breakeven.`;
    case 'stop':
      return `${nameOf(s)}: stopped at ${fmt(s, s.closed?.price ?? s.stop)} (${pipsText(o.pips ?? 0, s)}).\n${o.label}.`;
    case 'close':
      return `${nameOf(s)}: closed at ${fmt(s, s.closed?.price ?? 0)} (${pipsText(o.pips ?? 0, s)}).\n${o.label}.`;
  }
}

const SHOWN = 10;

/** The pinned record. @param {State} state @param {Style} style @param {Date} now */
export function recordText(state, style, now) {
  const c = tally(state);
  const lines = ['THE RECORD', ''];
  if (c.total === 0) {
    lines.push('No signals yet. Every signal posted here will be counted, losses included, and none deleted.');
  } else {
    lines.push(
      `Every signal posted here since ${when(/** @type {string} */ (state.since), style.timeZone)}. Nothing is deleted.`,
      '',
      `${c.total} signal${c.total === 1 ? '' : 's'}: ${c.win} won, ${c.loss} lost, ${c.breakeven} breakeven, ${c.open} open.`,
    );
    if (c.lossAfterTarget) {
      lines.push(`${c.lossAfterTarget} of the losses reached a target first, then the stop.`);
    }
    lines.push('', `Latest ${Math.min(SHOWN, c.total)}:`);
    const latest = [...state.signals.values()].sort((a, b) => b.id - a.id).slice(0, SHOWN);
    for (const s of latest) {
      const o = outcome(s);
      const pips = o.pips === null ? '' : ` (${pipsText(o.pips, s)})`;
      lines.push(`#${s.id} ${day(s.at, style.timeZone)} ${s.symbol} ${s.side}: ${o.label}${pips}`);
    }
  }
  lines.push(
    '',
    'How it counts: a win closed at the last target or in profit; a loss closed at the stop or at a loss, ' +
      'even after a target; breakeven closed at the entry. Levels are never changed after posting. ' +
      'Pips are never added up: past signals do not tell you what the next one will do.',
    `Changes after posting: ${state.edits} message${state.edits === 1 ? '' : 's'} edited, ` +
      `${state.deletions} found deleted. All still counted.`,
    `Updated ${when(now.toISOString(), style.timeZone)}`,
  );
  if (style.credit) lines.push('', `Kept with signal-channel-kit: ${KIT_REPO}`);
  return lines.join('\n');
}

/** @param {State} state */
export function openText(state) {
  const open = [...state.signals.values()].filter((s) => !s.closed);
  if (open.length === 0) return 'No open signals.';
  return open.map((s) => `${nameOf(s)} from ${fmt(s, s.entry)}: ${outcome(s).label}`).join('\n');
}

export const HELP = [
  'signal-channel-kit posts your signals to the channel and keeps an honest record pinned there.',
  '',
  '/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910',
  '   add "note" and a line of reasoning at the end if you like',
  '/hit tp1 - a target was reached',
  '/be - move the stop to the entry (posted in the channel)',
  '/stop - the stop was hit',
  '/close 1.0862 - closed at a price',
  '/open - the open signals',
  '/record - refresh the pinned record',
  '/whoami - your Telegram id',
  '',
  'With more than one open signal, say which: /hit tp1 #12 or /stop EURUSD.',
  'Levels cannot be changed after posting: close a wrong signal and post a new one. Both count.',
  '',
  ...HELP_LINKS,
  '',
  NETWORK_FOOTER,
].join('\n');
