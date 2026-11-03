# signal-channel-kit

A free, open-source Telegram bot for running a forex signal channel. You post a signal with one
command, or from a TradingView alert; the bot posts it to your channel, follows it in the same thread
at each target and the stop, and keeps a pinned record that counts every signal, losses included.

- **Post a signal:** `/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910`
- **Follow it:** `/hit tp1`, `/be`, `/stop`, `/close 1.0862`, each posted as a reply to the signal
- **TradingView:** alerts to a webhook with a shared secret
- **An honest record:** pinned in the channel, edited in place, counted by rules written down below.
  Nothing is deleted, levels cannot be changed after posting, and edits made in the channel are
  logged and counted.
- **Templates:** a [risk disclosure](templates/risk-disclosure.md) and [channel rules](templates/channel-rules.md)
- Node 20 or later, no dependencies, one JSON-lines file for storage, a Dockerfile

Text only. It does not draw charts.

> Want the chart drawn and redrawn at every target? That is
> [TradingSignalBot](https://tradingsignalbot.com/telegram-signal-bot/?via=channel-kit): the hosted bot
> posts every signal as a marked-up chart and redraws it in the thread at each target and the stop.
> Channel owners can have it [under their own brand](https://tradingsignalbot.com/telegram-signal-bot/?via=channel-kit#white-label).

## What it posts

A signal:

```
EURUSD BUY · signal #12

Entry 1.0850
Stop 1.0820 (-30 pips)
TP1 1.0880 (+30 pips)
TP2 1.0910 (+60 pips)

London breakout, retest of the range high

Posted 2 Nov 2026, 14:05 UTC
Not financial advice. Trading on margin carries a high risk: you can lose more than you put in.
```

A reply in its thread, then the end:

```
#12 EURUSD buy: TP1 reached at 1.0880 (+30 pips).
#12 EURUSD buy: stopped at 1.0820 (-30 pips).
Closed · TP1, then the stop.
```

The pinned record:

```
THE RECORD

Every signal posted here since 2 Nov 2026, 14:05 UTC. Nothing is deleted.

14 signals: 5 won, 6 lost, 1 breakeven, 2 open.
2 of the losses reached a target first, then the stop.

Latest 10:
#14 9 Nov EURUSD buy: Open · TP1 reached so far
#13 9 Nov XAUUSD sell: Closed · stopped before TP1 (-15 pips)
#12 2 Nov EURUSD buy: Closed · TP1, then the stop (-30 pips)
...

How it counts: a win closed at the last target or in profit; a loss closed at the stop or at a loss,
even after a target; breakeven closed at the entry. ...
Changes after posting: 1 message edited, 0 found deleted. All still counted.
```

(The figures above are an example of the format, not anyone's results.)

## Set it up

### 1. Make the bot

1. In Telegram, open [@BotFather](https://t.me/BotFather) and send `/newbot`. Pick a name and a
   username ending in `bot`. BotFather replies with a token like `123456789:AA...`: that is `BOT_TOKEN`.
   Keep it secret; anyone with it controls the bot.
2. Optional: `/setdescription` and `/setuserpic` for how the bot looks.

### 2. Add it to your channel as an admin

1. Open the channel, then **Administrators → Add Admin**, and search for the bot's username.
2. Give it **Post messages** and **Edit messages of others** (Telegram needs the second to pin
   messages in a channel). It needs nothing else: turn the rest off.
3. `CHANNEL_ID` is `@yourchannel` for a public channel. For a private one, forward any channel post to
   [@userinfobot](https://t.me/userinfobot) or open the channel in Telegram Web: the id starts with `-100`.

### 3. Find your user id

Start the bot (step 4) with any number in `ADMIN_IDS`, open a private chat with your bot and send
`/whoami`. Put the number it replies with in `ADMIN_IDS` (several admins: comma separated) and restart.

### 4. Run it

```sh
git clone https://github.com/TradingSignalBot/signal-channel-kit
cd signal-channel-kit
cp .env.example .env      # then fill it in
npm start
```

There is nothing to install: it uses Node's own `fetch` and test runner. Node 20 or later.

With Docker:

```sh
docker build -t signal-channel-kit .
docker run -d --name channel-kit --env-file .env -v channel-kit-data:/data -p 8080:8080 --restart unless-stopped signal-channel-kit
```

On Railway, Render or Fly: deploy the Dockerfile, set the variables from `.env.example`, and attach a
volume at `/data`. **Without a volume the record is lost on each deploy.**

The bot reads Telegram by long polling, so it needs no public address. Only TradingView alerts do.

### 5. Settings

| Variable | |
| --- | --- |
| `BOT_TOKEN` | From BotFather |
| `CHANNEL_ID` | `@name` or `-100...` |
| `ADMIN_IDS` | Who may post, comma separated |
| `DATA_DIR` | Where `events.jsonl` (the record) is kept. Default `./data` |
| `WEBHOOK_SECRET` | Turns TradingView alerts on. 16 characters or more |
| `PORT` | For the webhook. Default 8080 |
| `TIME_ZONE` | Posts are dated in it. Default `UTC` |
| `RISK_LINE` | The line under each signal |
| `PIP_SIZES` | For symbols the defaults get wrong, like `US30=1,BTCUSD=1` |
| `CREDIT` | `off` removes the kit's name from the foot of the record |

## Commands

Send these to the bot in a private chat. Only the ids in `ADMIN_IDS` can post.

| Command | |
| --- | --- |
| `/signal EURUSD buy 1.0850 sl 1.0820 tp 1.0880 1.0910` | Post a signal. Up to ten targets. Words can come in any order (`buy EURUSD @1.0850 SL 1.0820 TP1 1.0880 TP2 1.0910`). Add `note` and a line of reasoning at the end |
| `/hit tp1` | A target was reached. The last target closes the signal |
| `/be` | Move the stop to the entry. Posted in the channel, so the move is on the record |
| `/stop` | The stop was hit: closes at the stop |
| `/close 1.0862` | Closed at a price, in profit or at a loss |
| `/open` | The open signals |
| `/record` | Refresh the pinned record (or post a new one if it was deleted) |
| `/whoami`, `/help` | Your id; the list |

With more than one signal open, say which: `/hit tp1 #12` or `/stop EURUSD`.

There is no command to change a signal's levels, delete it or hide it. A wrong signal is closed with
`/close` and a new one posted: both stay on the record.

## TradingView alerts

Set `WEBHOOK_SECRET` and make the bot reachable over HTTPS (Railway, Render and Fly give you an
address). In TradingView's alert dialog, under **Notifications**, tick **Webhook URL**:

```
https://your-host/tradingview?key=YOUR_WEBHOOK_SECRET
```

and write the command in the alert's **Message**, with TradingView's placeholders:

```
{{ticker}} buy {{close}} sl 1.0820 tp 1.0880 1.0910
```

The message can also be JSON:

```json
{"secret": "YOUR_WEBHOOK_SECRET", "symbol": "{{ticker}}", "side": "buy", "entry": {{close}}, "sl": 1.0820, "tp": [1.0880, 1.0910]}
```

Updates work the same way, one command a line: `hit tp1 {{ticker}}`, `stop {{ticker}}`,
`close {{close}} {{ticker}}`. The bot answers with JSON (`{"ok": true, "results": [...]}`); a wrong
secret gets a 401 and nothing is posted. `GET /healthz` is for your host's health check.

TradingView puts the secret in an address it stores; anyone who sees your alert can post to your
channel. Use a long random secret, and change it if an alert is shared.

## How the record counts

The rules are the same as [TradingSignalBot's](https://tradingsignalbot.com/how-we-count/?via=channel-kit),
for a whole position held from the entry:

- A signal ends at its **last target**, at its **stop**, or when an admin **closes** it at a price.
- **Win:** closed at the last target, or closed at a price in profit.
- **Loss:** closed at the stop, or at a price at a loss. A signal that reached a target and then
  its stop is a loss, shown as "TP1, then the stop": a trader who held the whole position to the stop
  lost the stop distance, so it never reads as a clean win.
- **Breakeven:** closed at the entry: the stop after a posted move to the entry, or a close at the
  entry price.
- **Open:** still running, with the furthest target so far.
- Pips are counted from the entry: four decimals on a currency pair, two with the yen, and on gold
  one dollar is one pip. They are shown per signal and **never added up**: past signals do not tell
  you what the next one will do.

What the bot will not do:

- **Delete a signal** or take it off the record. Every command is a line appended to
  `data/events.jsonl`, which the bot never rewrites; the state and the record are replayed from it.
- **Change levels** after posting.
- **Count a signal the channel never saw.** A signal is counted only once Telegram has posted it.
- **Hide changes.** If someone edits one of the bot's messages in the channel, the edit is logged with
  its new text and counted on the record. If a signal's message is found deleted (when the bot next
  replies to it), that is logged and counted too, and the signal still counts.

`npm run export > record.csv` writes every signal from the log as CSV, for a website or a
spreadsheet.

## Run the tests

```sh
npm test
```

Node's own test runner: the parser, the counting, the bot against a Telegram double, and the webhook.

## Before you start a channel

Read [How to start a forex signal channel](https://tradingsignalbot.com/guides/how-to-start-a-forex-signal-channel/?via=channel-kit):
what to decide first, the law on charging for signals, setting up the channel, and keeping a record
you would show anyone. Then fill in the [risk disclosure](templates/risk-disclosure.md) and
[channel rules](templates/channel-rules.md) templates and pin them.

## Licence

MIT. See [LICENSE](LICENSE).

---

Part of the Forexia network: [InterestRateDecision.com](https://interestratedecision.com/?via=channel-kit) ·
[Forexia Academy](https://forexiapro.com/?via=channel-kit) ·
[TradingSignalBot](https://tradingsignalbot.com/?via=channel-kit) ·
[PropSim](https://github.com/PropSim-Enterprise) ·
[OpenCharts](https://github.com/dylanpersonguy/OpenCharts)
