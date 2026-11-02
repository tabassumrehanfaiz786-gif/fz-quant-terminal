import { describe, expect, it } from "vitest";
import { isLargeInScale, radarScore, rfqQuote, sliceOrder, sweep } from "./desk";

describe("desk", () => {
  it("sweeps through levels and reports slippage", () => {
    const r = sweep([[100, 1], [101, 1], [102, 1]], 2);
    expect(r.avg).toBe(100.5);
    expect(r.worst).toBe(101);
    expect(r.slipBps).toBe(50);
  });
  it("reports unfilled size when book is too thin", () => {
    expect(sweep([[100, 1]], 3).unfilled).toBe(2);
  });
  it("RFQ buy quotes above mid, sell below", () => {
    expect(rfqQuote(100, 4, "buy").price).toBeGreaterThan(100);
    expect(rfqQuote(100, 4, "sell").price).toBeLessThan(100);
  });
  it("slices sum back to the parent order", () => {
    const s = sliceOrder(10, 0.5);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 6);
  });
  it("LIS threshold at $500k", () => {
    expect(isLargeInScale(499_999)).toBe(false);
    expect(isLargeInScale(500_000)).toBe(true);
  });
  it("radar score is clip share of top depth", () => {
    expect(radarScore(1, 4)).toBe(25);
  });
});
