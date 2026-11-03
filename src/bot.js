// @ts-check
// What the bot does with a command, from an admin in Telegram or from a TradingView alert.
// One command at a time, so two alerts arriving together never get the same number.

import { ParseError, parseCommand } from './parse.js';
import { Refusal, apply, emptyState, outcome, pick, problemWith, replay } from './record.js';
import { HELP, openText, recordText, signalText, updateText } from './format.js';
import { TelegramError, isNotFound, isNotModified } from './telegram.js';

/** @typedef {import('./record.js').Event} Event */
/** @typedef {import('./record.js').Signal} Signal */
/** @typedef {import('./format.js').Style} Style */
/**
 * @typedef {object} Config
 * @property {string} channel  "@name" or "-100..."
 * @property {Set<number>} admins  Telegram user ids allowed to post
 * @property {Style} style
 */
/** @typedef {{ by: string, source: 'telegram' | 'tradingview', userId?: number }} Who */

export class Bot {
  /**
   * @param {{ telegram: import('./telegram.js').Telegram, store: import('./store.js').Store, config: Config,
   *   now?: () => Date, log?: (msg: string) => void }} deps
   */
  constructor({ telegram, store, config, now = () => new Date(), log = console.log }) {
    this.tg = telegram;
    this.store = store;
    this.config = config;
    this.now = now;
    this.log = log;
    this.state = emptyState();
    /** @type {Promise<unknown>} */
    this.chain = Promise.resolve();
  }

  async init() {
    this.state = replay(await this.store.load());
    return this;
  }

  /** Run one job after the ones before it. @template T @param {() => Promise<T>} job @returns {Promise<T>} */
  serial(job) {
    const run = this.chain.then(job);
    this.chain = run.catch(() => {});
    return run;
  }

  /** @param {Event} e */
  async record(e) {
    await this.store.append(e);
    apply(this.state, e);
  }

  /** @param {string} text @param {Record<string, unknown>} [extra] */
  post(text, extra = {}) {
    return this.tg.call('sendMessage', {
      chat_id: this.config.channel,
      text,
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  /**
   * One update from getUpdates.
   * @param {any} update
   */
  async handleUpdate(update) {
    if (update.edited_channel_post) return this.serial(() => this.noticeEdit(update.edited_channel_post));
    const msg = update.message;
    if (!msg?.text || !msg.from || msg.chat?.type !== 'private') return;
    const userId = /** @type {number} */ (msg.from.id);
    const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || '';
    const reply = await this.handleText(msg.text, { by: `${userId} ${name}`.trim(), source: 'telegram', userId });
    if (reply) {
      await this.tg.call('sendMessage', { chat_id: msg.chat.id, text: reply, link_preview_options: { is_disabled: true } });
    }
  }

  /**
   * One command. Returns what to tell the sender.
   * @param {string} text
   * @param {Who} who
   * @returns {Promise<string>}
   */
  async handleText(text, who) {
    /** @type {import('./parse.js').Command} */
    let command;
    try {
      command = parseCommand(text);
    } catch (err) {
      if (err instanceof ParseError) return err.message;
      throw err;
    }
    if (command.cmd === 'whoami') return `Your Telegram id is ${who.userId}. Put it in ADMIN_IDS to post signals.`;
    if (command.cmd === 'help' || command.cmd === 'start') return HELP;
    if (who.source === 'telegram' && !this.config.admins.has(/** @type {number} */ (who.userId))) {
      return `Only this channel's admins can post through this bot. Your id is ${who.userId}; the owner can add it to ADMIN_IDS.`;
    }
    const cmd = command;
    return this.serial(async () => {
      try {
        switch (cmd.cmd) {
          case 'signal':
            return await this.newSignal(cmd.signal, who);
          case 'hit':
          case 'be':
          case 'stop':
          case 'close':
            return await this.change(cmd, who);
          case 'open':
            return openText(this.state);
          case 'record':
            return (await this.refreshRecord()) || 'The pinned record is up to date.';
        }
      } catch (err) {
        if (err instanceof Refusal) return err.message;
        const why = err instanceof Error ? err.message : String(err);
        this.log(`Error: ${why}`);
        if (err instanceof TelegramError) return `Telegram refused it (${why}). Nothing was posted or counted.`;
        return `That failed (${why}). Check the bot's log before trying again.`;
      }
      return '';
    });
  }

  /** @param {import('./parse.js').SignalInput} input @param {Who} who */
  async newSignal(input, who) {
    const id = this.state.nextId;
    /** @type {Extract<Event, { t: 'signal' }>} */
    const e = { t: 'signal', id, at: this.now().toISOString(), by: who.by, source: who.source, ...input, messageId: 0 };
    const draft = replay([e]).signals.get(id);
    // Posted first, then counted: a signal the channel never saw is not on the record.
    const sent = await this.post(signalText(/** @type {Signal} */ (draft), this.config.style));
    e.messageId = sent.message_id;
    await this.record(e);
    const warning = await this.refreshRecord();
    return [`Posted signal #${id} to the channel.`, warning].filter(Boolean).join('\n');
  }

  /**
   * @param {Extract<import('./parse.js').Command, { cmd: 'hit' | 'be' | 'stop' | 'close' }>} cmd
   * @param {Who} who
   */
  async change(cmd, who) {
    const s = pick(this.state, cmd.select);
    const problem = problemWith(s, cmd);
    if (problem) throw new Refusal(problem);
    const base = { id: s.id, at: this.now().toISOString(), by: who.by, messageId: 0 };
    /** @type {Event} */
    const e =
      cmd.cmd === 'hit' ? { t: 'hit', ...base, tp: cmd.tp }
      : cmd.cmd === 'be' ? { t: 'be', ...base }
      : cmd.cmd === 'stop' ? { t: 'stop', ...base, price: s.stop }
      : { t: 'close', ...base, price: cmd.price };

    const preview = emptyState();
    preview.signals.set(s.id, structuredClone(s));
    apply(preview, e);
    const after = /** @type {Signal} */ (preview.signals.get(s.id));

    const sent = await this.replyInThread(s, updateText(after, cmd.cmd));
    e.messageId = sent.message_id;
    await this.record(e);
    const warning = await this.refreshRecord();
    const done = after.closed ? `Signal #${s.id}: ${outcome(after).label}.` : `Posted the update to #${s.id}.`;
    return [done, warning].filter(Boolean).join('\n');
  }

  /** Reply to the signal, so the trade reads as one thread. @param {Signal} s @param {string} text */
  async replyInThread(s, text) {
    if (!s.deleted) {
      try {
        return await this.post(text, { reply_parameters: { message_id: s.messageId, allow_sending_without_reply: false } });
      } catch (err) {
        if (!isNotFound(err)) throw err;
        await this.record({ t: 'deleted', at: this.now().toISOString(), id: s.id, messageId: s.messageId });
        this.log(`Signal #${s.id}'s message was deleted from the channel. Logged; it still counts.`);
      }
    }
    return this.post(text);
  }

  /** @param {any} chat */
  isChannel(chat) {
    const want = this.config.channel.toLowerCase();
    return String(chat?.id) === want || (chat?.username && `@${String(chat.username).toLowerCase()}` === want);
  }

  /** Someone edited a message in the channel. If it is one of the bot's signal messages, log it. @param {any} post */
  async noticeEdit(post) {
    if (!this.isChannel(post.chat) || post.message_id === this.state.pinnedId) return;
    const s = [...this.state.signals.values()].find((x) => x.messages.includes(post.message_id));
    if (!s) return;
    await this.record({
      t: 'edited', at: this.now().toISOString(), id: s.id, messageId: post.message_id,
      text: String(post.text ?? post.caption ?? '').slice(0, 1000),
    });
    this.log(`A message of signal #${s.id} was edited in the channel. Logged.`);
    await this.refreshRecord();
  }

  /** Edit the pinned record, or post and pin a new one. Returns a warning for the admin, or ''. */
  async refreshRecord() {
    const text = recordText(this.state, this.config.style, this.now());
    if (this.state.pinnedId) {
      try {
        await this.tg.call('editMessageText', {
          chat_id: this.config.channel, message_id: this.state.pinnedId, text,
          link_preview_options: { is_disabled: true },
        });
        return '';
      } catch (err) {
        if (isNotModified(err)) return '';
        if (!isNotFound(err)) return `Could not update the pinned record: ${err instanceof Error ? err.message : err}`;
        this.log('The pinned record was deleted; posting a new one.');
      }
    }
    const sent = await this.post(text);
    await this.record({ t: 'pinned', at: this.now().toISOString(), messageId: sent.message_id });
    try {
      await this.tg.call('pinChatMessage', {
        chat_id: this.config.channel, message_id: sent.message_id, disable_notification: true,
      });
      return '';
    } catch (err) {
      return `Posted the record but could not pin it. Give the bot the right to edit messages in the channel, then send /record. (${err instanceof Error ? err.message : err})`;
    }
  }
}
