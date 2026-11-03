<!--
Draft for a TradingSignalBot guide page. Not part of the kit's code.

Suggested slug:   /guides/telegram-signal-bot-github/
Phrase it takes:  "telegram signal bot github" (and "open source telegram signal bot", "free telegram signal bot").
It does not take "how to start a forex signal channel": that is the existing guide, which this page
links to and which should link back here from its "Let a bot do the posting" point.
Title (under 65):  Free Telegram Signal Bot on GitHub: Post Signals, Keep a Record
Description:       An open-source Telegram bot for signal channels: post by command or TradingView alert, follow each trade in its thread, and pin a record that counts the losses.
Byline:            the same author as the existing guide.
Links from:        /telegram-signal-bot/ (a line under the comparison or the FAQ), /guides/, the existing guide.
Every link to the repo: https://github.com/TradingSignalBot/signal-channel-kit
No figures in this page are results; the record example is labelled as a format.
-->

# A free Telegram signal bot on GitHub

**In brief**

- signal-channel-kit is a free, open-source Telegram bot for a signal channel. MIT licensed.
- You post a signal with one command or a TradingView alert; it posts it to your channel and follows
  it in the same thread at each target and the stop.
- It keeps a pinned record that counts every signal, losses included, by rules written down first.
  Nothing can be deleted or changed after posting.
- It is text only. TradingSignalBot is the hosted version that draws the chart and redraws it at
  every target.

## Why we published it

Most signal channels start the same way: someone types signals by hand, forgets an update or two,
and the "record" is whatever they remember. A month later nobody, the owner included, can say how
the signals did.

We run TradingSignalBot's own channels on rules we wrote down before the first signal, and we show
every outcome, [losses included](/how-we-count/). The part of that which needs no charts or
strategy is simple enough to give away: posting the signal cleanly, following it to the end, and
counting it honestly. That is signal-channel-kit.

## What it does

- **Posts a signal from one line.** `/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910` becomes a
  clear post: the market and direction first, the entry, the stop and every target with its distance
  in pips, the time, and a risk line.
- **Takes TradingView alerts.** Point an alert's webhook at the bot with a shared secret and write
  the signal in the alert's message, with TradingView's `{{ticker}}` and `{{close}}`.
- **Follows every trade in its thread.** `/hit tp1`, `/stop` and `/close 1.0862` post as replies to
  the signal, so a subscriber who opens the channel days later sees the whole trade in one place.
- **Pins a record and keeps it current.** Every change edits the pinned message: how many signals
  won, lost, broke even and are still open, and the latest ten with their outcomes.

## How it counts

The kit counts the way our record does, for a whole position held from the entry:

- **Win:** closed at the last target, or closed at a price in profit.
- **Loss:** closed at the stop, or at a price at a loss. A signal that reached a target and then
  the stop is a loss, shown as "TP1, then the stop". It never reads as a clean win, because a trader
  who held the whole position to the stop lost the stop distance.
- **Breakeven:** closed at the entry, for example after a move of the stop to the entry that was
  posted in the channel.
- **Pips are never added up.** Each signal shows its own; a total is a sales figure, and past
  signals do not tell you what the next one will do.

And what it will not do: delete a signal, change its levels after posting, or count a signal the
channel never saw. If someone edits one of the bot's messages in the channel, or a signal's message
is found deleted, the record says so and the signal still counts. Every command is a line in a log
the bot only ever adds to, and the record is rebuilt from it.

## Set it up in four steps

1. **Make the bot.** In Telegram, send `/newbot` to @BotFather and keep the token it gives you.
2. **Make it an admin of your channel** with two rights: post messages, and edit messages of others
   (Telegram needs that one to pin the record).
3. **Run it.** On your own machine with Node 20 (`npm start`, no install step), or with the
   Dockerfile on Railway, Render or Fly. Give it a volume: the log on it is your record.
4. **Send `/whoami`** to the bot, put your id in `ADMIN_IDS`, and post your first signal.

The [README](https://github.com/TradingSignalBot/signal-channel-kit#set-it-up) has every setting and
the TradingView alert format.

## Templates to pin

The kit comes with two templates to fill in and pin in your channel:

- **A risk disclosure**: what the signals are and are not, why your results will differ, and how the
  record counts. Have a lawyer read yours: charging for signals is regulated in many countries
  ([our guide](/guides/how-to-start-a-forex-signal-channel/) explains).
- **Channel rules**: what you post, how long a trade lasts, what every signal carries, and how the
  record counts.

## The kit or TradingSignalBot?

| | signal-channel-kit | TradingSignalBot |
| --- | --- | --- |
| Price | Free, MIT | [See the bot](/telegram-signal-bot/) |
| Hosting | Yours | Ours |
| Signals | You type them, or TradingView sends them | Your strategy, automated, or ours |
| The post | Text | A marked-up chart with every level priced |
| Each target and the stop | A reply you trigger | A redrawn chart, posted when price gets there |
| The record | Pinned in the channel | Pinned, plus a public page per signal |
| Your brand | Your bot's name | [White label](/telegram-signal-bot/#white-label): your logo and chart template |

If typing `/hit tp1` at three in the morning is the part you would rather not do, or you want a chart
a subscriber can read at a glance, that is what [TradingSignalBot](/telegram-signal-bot/) is for.

## Before your first signal

Read [how to start a forex signal channel](/guides/how-to-start-a-forex-signal-channel/): deciding
what you send, checking the law, setting up the channel, and keeping a record you would show anyone.

Trading foreign exchange and gold on margin carries a high level of risk and may not be suitable for
you. You can lose more than you put in. Signals are general information, not financial advice.
