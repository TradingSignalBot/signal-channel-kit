// @ts-check
// Where the kit points. Every link carries ?via=channel-kit so TradingSignalBot can count what the kit sends.

const VIA = 'via=channel-kit';

export const TSB_BOT = `https://tradingsignalbot.com/telegram-signal-bot/?${VIA}`;
export const TSB_WHITE_LABEL = `https://tradingsignalbot.com/telegram-signal-bot/?${VIA}#white-label`;
export const TSB_GUIDE = `https://tradingsignalbot.com/guides/how-to-start-a-forex-signal-channel/?${VIA}`;
export const TSB_HOW_WE_COUNT = `https://tradingsignalbot.com/how-we-count/?${VIA}`;
export const KIT_REPO = 'https://github.com/TradingSignalBot/signal-channel-kit';

export const HELP_LINKS = [
  `Want the chart drawn and redrawn at every target? That is TradingSignalBot: ${TSB_BOT}`,
  `How to start a forex signal channel: ${TSB_GUIDE}`,
  `Your own branded signal bot (white label): ${TSB_WHITE_LABEL}`,
];

export const NETWORK_FOOTER =
  'Part of the Forexia network: InterestRateDecision.com · Forexia Academy · TradingSignalBot · PropSim · OpenCharts';
