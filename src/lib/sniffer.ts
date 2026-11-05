// Pure counter-surveillance engine: looks for the statistical footprint of a sliced
// parent order (5-vector stealth slicer) in public trade prints. Estimates only.
export type Print = { time: number; price: number; qty: number; side: "buy" | "sell" };
export type SnifferVectors = { size: number; timing: number; pov: number; persistence: number; price: number };
export type ParentEstimate = {
  side: "buy" | "sell"; clips: number; filledBtc: number; notional: number; avgClip: number;
  vwap: number; start: number; last: number; ratePerMin: number; povPct: number;
  vectors: SnifferVectors; score: number; tier: "noise" | "suspect" | "likely";
};
export const SNIFFER_WEIGHTS = { size: 0.25, timing: 0.25, pov: 0.15, persistence: 0.2, price: 0.15 } as const;

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export function cv(a: number[]) {
  const m = mean(a); if (a.length < 2 || m <= 0) return Infinity;
  return Math.sqrt(mean(a.map(x => (x - m) ** 2))) / m;
}
const clamp = (x: number) => Math.max(0, Math.min(100, x));

/** Size vector: jittered clips cluster tightly (CV ≈ 0.1–0.35); organic flow is heavy-tailed (CV > 1). */
export const sizeScore = (sizes: number[]) => clamp(100 * (1 - (cv(sizes) - 0.1) / 0.6));
/** Timing vector: Poisson arrivals have interval CV ≈ 1; uniform 50–150% jitter gives ≈ 0.29. */
export const timingScore = (gapsMs: number[]) => (gapsMs.length < 3 ? 0 : clamp(100 * (1 - Math.abs(cv(gapsMs) - 0.3) / 0.6)));
/** POV vector: a capped participation rate sits in a steady 2–25% band of same-side volume. */
export const povFootprint = (pct: number) => (pct < 1 ? 0 : pct <= 25 ? 100 : clamp(100 - (pct - 25) * 3));

/** Splits the window into 4 slices; the parent should be present in most of them. */
export function persistenceScore(times: number[], start: number, end: number) {
  if (end <= start || !times.length) return 0;
  const seen = new Set(times.map(t => Math.min(3, Math.floor(((t - start) / (end - start)) * 4))));
  return (seen.size / 4) * 100;
}
/** Price vector: a working buy order walks flat-or-up, a sell flat-or-down. */
export function priceScore(prices: number[], side: "buy" | "sell") {
  if (prices.length < 3) return 0;
  let ok = 0;
  for (let i = 1; i < prices.length; i++) { const a = prices[i - 1]!, b = prices[i]!; if (side === "buy" ? b >= a : b <= a) ok++; }
  return (ok / (prices.length - 1)) * 100;
}

export const snifferTier = (score: number): ParentEstimate["tier"] => (score >= 70 ? "likely" : score >= 50 ? "suspect" : "noise");

/** Finds the densest band of similar-sized clips on each side and scores it against the five vectors. */
export function sniff(prints: Print[], now: number, windowMs = 120_000, minClips = 6, maxClipBtc = 2): ParentEstimate[] {
  const recent = prints.filter(p => p.time >= now - windowMs && p.time <= now);
  const out: ParentEstimate[] = [];
  for (const side of ["buy", "sell"] as const) {
    const all = recent.filter(p => p.side === side);
    const sideVol = all.reduce((s, p) => s + p.qty, 0);
    const small = all.filter(p => p.qty >= 0.01 && p.qty <= maxClipBtc);
    let best: Print[] = [];
    for (const c of small) {
      const band = small.filter(p => p.qty >= c.qty * 0.7 && p.qty <= c.qty * 1.3);
      if (band.length > best.length) best = band;
    }
    if (best.length < minClips) continue;
    best.sort((a, b) => a.time - b.time);
    const gaps = best.slice(1).map((p, i) => p.time - best[i]!.time).filter(g => g > 0);
    const filled = best.reduce((s, p) => s + p.qty, 0);
    const notional = best.reduce((s, p) => s + p.qty * p.price, 0);
    const povPct = sideVol ? (filled / sideVol) * 100 : 0;
    const start = best[0]!.time, last = best[best.length - 1]!.time;
    const vectors: SnifferVectors = {
      size: sizeScore(best.map(p => p.qty)), timing: timingScore(gaps), pov: povFootprint(povPct),
      persistence: persistenceScore(best.map(p => p.time), now - windowMs, now), price: priceScore(best.map(p => p.price), side),
    };
    const score = Math.round((Object.keys(SNIFFER_WEIGHTS) as (keyof SnifferVectors)[]).reduce((s, k) => s + vectors[k] * SNIFFER_WEIGHTS[k], 0));
    out.push({ side, clips: best.length, filledBtc: filled, notional, avgClip: filled / best.length, vwap: notional / filled, start, last,
      ratePerMin: filled / Math.max(1 / 60, (last - start) / 60_000), povPct, vectors, score, tier: snifferTier(score) });
  }
  return out.sort((a, b) => b.score - a.score);
}
