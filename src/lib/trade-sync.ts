// Pure helpers for syncing engine trades to the cloud and diffing new ones.
import type { Mode, Side, Trade } from "./strategy";

export interface SyncableTrade {
  mode: Mode;
  timeframe: string;
  side: Side;
  level: number;
  entry: number;
  exit: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  reason: string;
}

/** Map engine trades to the portable shape sent to the server. */
export function toSyncableTrades(mode: Mode, timeframe: string, trades: Trade[]): SyncableTrade[] {
  return trades.map((t) => ({
    mode,
    timeframe,
    side: t.side,
    level: t.level,
    entry: t.entry,
    exit: t.exit,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    pnl: t.pnl,
    reason: t.reason,
  }));
}

/** Return only the trades after `alreadySynced` (engine trades append-only). */
export function unsyncedTrades(trades: Trade[], alreadySynced: number): Trade[] {
  if (alreadySynced < 0) return trades;
  return trades.slice(Math.min(alreadySynced, trades.length));
}

/** Stable dedupe key matching the database unique constraint. */
export function tradeKey(t: SyncableTrade): string {
  return [t.mode, t.timeframe, t.entryTime, t.exitTime].join("|");
}
