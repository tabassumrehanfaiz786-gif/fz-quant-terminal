import { describe, expect, it } from "vitest";
import { sniff, sizeScore, snifferTier, timingScore, type Print } from "./sniffer";

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe("sniffer", () => {
  it("flags a jittered 0.5 BTC buy slicer hidden in organic flow", () => {
    const r = rng(7), now = 120_000, prints: Print[] = [];
    let t = 1000, px = 80_000;
    while (t < now) { prints.push({ time: t, price: px, qty: 0.5 * (0.85 + r() * 0.3), side: "buy" }); px += r() < 0.5 ? 0 : 1; t += 2000 * (0.5 + r()); }
    for (let i = 0; i < 200; i++) prints.push({ time: r() * now, price: 80_000 + r() * 50, qty: (-Math.log(r())) ** 3 * 0.2 + 0.001, side: r() < 0.5 ? "buy" : "sell" });
    const top = sniff(prints, now)[0];
    expect(top?.side).toBe("buy");
    expect(top?.tier).toBe("likely");
  });

  it("scores Poisson timing and heavy-tailed sizes low", () => {
    const r = rng(3);
    expect(timingScore(Array.from({ length: 50 }, () => -Math.log(r()) * 1000))).toBeLessThan(30);
    expect(sizeScore([0.01, 0.02, 0.5, 3, 0.05, 1.2, 0.003])).toBe(0);
  });

  it("needs at least 6 similar clips and maps tiers at 50 and 70", () => {
    expect(sniff([{ time: 1, price: 1, qty: 0.5, side: "buy" }], 10)).toEqual([]);
    expect([snifferTier(49), snifferTier(50), snifferTier(70)]).toEqual(["noise", "suspect", "likely"]);
  });
});
