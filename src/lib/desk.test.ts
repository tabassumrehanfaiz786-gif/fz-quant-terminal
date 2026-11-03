import { describe, expect, it } from "vitest";
import { isLargeInScale, radarScore, radarTier, rfqQuote, sliceOrder, sweep } from "./desk";

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
  it("radar tiers: stealth <20%, borderline 20–50%, detected >50%", () => {
    expect(radarTier(19)).toBe("stealth");
    expect(radarTier(20)).toBe("borderline");
    expect(radarTier(50)).toBe("borderline");
    expect(radarTier(51)).toBe("detected");
    expect(radarTier(30, 35)).toBe("stealth");
  });
});

import { complianceTicket, multiVectorStealth, povScore, sizeEntropy, sliceIntervals } from "./desk";
describe("multi-vector radar & ticket", () => {
  it("scores uniform clips as zero entropy and random clips higher", () => {
    expect(sizeEntropy([1, 1, 1])).toBe(0);
    expect(sizeEntropy([0.7, 1.3, 0.7, 1.3])).toBe(100);
  });
  it("blends five vectors 25/25/15/20/15", () => {
    const lv: [number, number][] = [[100, 1], [101, 1], [102, 1], [103, 1], [104, 1]];
    // clip 1 BTC/s vs tape 9 BTC/s = 10% POV -> score 60; uniform sizes & timing = 0
    const m = multiVectorStealth(0.5, lv, [1, 1], { intervalsMs: [1000, 1000], tapeBtcPerSec: 9 });
    expect(m.top).toBe(50); expect(m.l5).toBe(90); expect(m.pov).toBe(10); expect(m.povScore).toBe(60); expect(m.timing).toBe(0);
    expect(m.composite).toBe(47); // 12.5 + 22.5 + 0 + 12 + 0
  });
  it("POV of 25% or more scores zero; no tape data scores zero", () => {
    expect(povScore([1], [1000], 3).score).toBe(0);
    expect(povScore([1], [1000], 0).score).toBe(0);
  });
  it("jittered intervals stay within 50-150% of base", () => {
    const g = sliceIntervals(50, 400, 3);
    expect(Math.min(...g)).toBeGreaterThanOrEqual(200); expect(Math.max(...g)).toBeLessThanOrEqual(600);
  });
  it("flags LIS at $500k and computes RFQ savings", () => {
    const k = complianceTicket({ side: "buy", qty: 10, mid: 50_000, sweepAvg: 50_100, sweepFilled: 10, rfqPrice: 50_050, rfqBps: 5, stealth: 80, time: new Date(0) });
    expect(k.lisMet).toBe(true); expect(k.savedUsd).toBe(500); expect(k.bestVenue).toBe("OTC RFQ");
    expect(complianceTicket({ side: "buy", qty: 9, mid: 50_000, sweepAvg: 1, sweepFilled: 1, rfqPrice: 1, rfqBps: 1, stealth: 0, time: new Date(0) }).lisMet).toBe(false);
  });
});
