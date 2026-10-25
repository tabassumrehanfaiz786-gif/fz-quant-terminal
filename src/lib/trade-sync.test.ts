import { describe, it, expect } from "vitest";
import { toSyncableTrades, unsyncedTrades, tradeKey } from "./trade-sync";
import type { Trade } from "./strategy";

const t = (id: number, entryTime: number, exitTime: number): Trade => ({
  id, side: "long", level: 80000, entry: 80200, exit: 82700, entryTime, exitTime, pnl: 1200, reason: "RUNNER",
});

describe("trade sync helpers", () => {
  it("returns only trades after the synced cursor", () => {
    const trades = [t(1, 100, 200), t(2, 300, 400), t(3, 500, 600)];
    expect(unsyncedTrades(trades, 2)).toEqual([trades[2]]);
    expect(unsyncedTrades(trades, 3)).toEqual([]);
    expect(unsyncedTrades(trades, 99)).toEqual([]);
  });
  it("maps engine trades to the syncable shape with mode and timeframe", () => {
    const [s] = toSyncableTrades("sweep", "15m", [t(1, 100, 200)]);
    expect(s).toMatchObject({ mode: "sweep", timeframe: "15m", side: "long", level: 80000, entry: 80200, exit: 82700, entryTime: 100, exitTime: 200, pnl: 1200, reason: "RUNNER" });
  });
  it("dedupe key distinguishes modes and times", () => {
    const a = toSyncableTrades("sweep", "15m", [t(1, 100, 200)])[0]!;
    const b = toSyncableTrades("touch", "15m", [t(1, 100, 200)])[0]!;
    const c = toSyncableTrades("sweep", "5m", [t(1, 100, 200)])[0]!;
    expect(tradeKey(a)).not.toBe(tradeKey(b));
    expect(tradeKey(a)).not.toBe(tradeKey(c));
  });
});
