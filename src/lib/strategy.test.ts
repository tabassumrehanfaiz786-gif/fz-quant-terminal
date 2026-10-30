import { describe, it, expect } from "vitest";
import { createEngine, onCandleClose, managePrice, type Candle } from "./strategy";

const k = (o: number, h: number, l: number, c: number, buy = 5, vol = 10, time = 1): Candle => ({ time, open: o, high: h, low: l, close: c, volume: vol, buyVolume: buy });

describe("strategy rules", () => {
  it("sizes positions at $50,000", () => {
    const s = createEngine("touch");
    onCandleClose(s, k(70100, 70120, 69990, 70050));
    expect(s.position!.qty * s.position!.entry).toBeCloseTo(50_000);
  });
  it("caps the structure stop at $2,500", () => {
    const s = createEngine("sweep");
    onCandleClose(s, k(70200, 70300, 67000, 70100, 2));
    expect(s.position!.entry - s.position!.stop).toBe(2500);
  });
  it("moves stop to break-even after +$2,500 and runs to next 10k", () => {
    const s = createEngine("touch");
    onCandleClose(s, k(70100, 70120, 69990, 70000));
    managePrice(s, 72500, 2);
    expect(s.position!.stop).toBe(70000);
    expect(s.position!.qty).toBeCloseTo(s.position!.initialQty / 2);
    expect(s.position!.target).toBe(80000);
  });
  it("blocks re-entry until a clean $1,000 retest", () => {
    const s = createEngine("touch");
    onCandleClose(s, k(70100, 70120, 69990, 70000));
    managePrice(s, 67000, 2); // stopped
    onCandleClose(s, k(70100, 70120, 69990, 70000, 5, 10, 3));
    expect(s.position).toBeNull();
    onCandleClose(s, k(71000, 71100, 71000, 71100, 5, 10, 4));
    onCandleClose(s, k(70100, 70120, 69990, 70000, 5, 10, 5));
    expect(s.position).not.toBeNull();
  });
  it("reverses once after a full stop with stop beyond the 10k level", () => {
    const s = createEngine("touch");
    onCandleClose(s, k(70100, 70120, 69990, 70000));
    managePrice(s, 67000, 2);
    expect(s.position!.side).toBe("short");
    expect(s.position!.entry).toBe(67500);
    expect(s.position!.stop).toBe(70000);
    managePrice(s, 71000, 3);
    expect(s.position).toBeNull();
  });
});
