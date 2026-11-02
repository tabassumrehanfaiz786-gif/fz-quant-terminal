// Pure OTC & stealth execution math. Simulation only: no real orders are sent.
export type Side = "buy" | "sell";
export type Lvl = [number, number]; // price, qty

/** Sweep the visible book with a market order. Returns average fill and slippage vs. top of book. */
export function sweep(levels: Lvl[], qty: number) {
  let left = qty, cost = 0, last = levels[0]?.[0] ?? 0;
  for (const [p, q] of levels) {
    if (left <= 0) break;
    const take = Math.min(q, left);
    cost += take * p; left -= take; last = p;
  }
  const filled = qty - left;
  const avg = filled ? cost / filled : 0;
  const top = levels[0]?.[0] ?? 0;
  return { filled, avg, worst: last, unfilled: left, slipBps: top ? (Math.abs(avg - top) / top) * 10_000 : 0 };
}

/** Bilateral RFQ quote: fixed spread around mid, wider for larger blocks. */
export function rfqQuote(mid: number, qty: number, side: Side, baseBps = 2) {
  const bps = baseBps + Math.min(8, Math.sqrt(qty));
  const px = side === "buy" ? mid * (1 + bps / 10_000) : mid * (1 - bps / 10_000);
  return { price: px, bps };
}

/** Split a parent order into child clips with jitter (deterministic via seed). */
export function sliceOrder(qty: number, clip: number, seed = 1) {
  const out: number[] = [];
  let left = qty, s = seed;
  while (left > 1e-9) {
    s = (s * 9301 + 49297) % 233280;
    const jitter = 0.7 + (s / 233280) * 0.6;
    const c = Math.min(left, +(clip * jitter).toFixed(4));
    out.push(c); left = +(left - c).toFixed(8);
  }
  return out;
}

/** Large-in-scale check (illustrative notional threshold). */
export const LIS_NOTIONAL = 500_000;
export const isLargeInScale = (notional: number) => notional >= LIS_NOTIONAL;

/** How visible a clip is relative to resting top-of-book depth (0 = invisible, 100 = obvious). */
export function radarScore(clip: number, topDepth: number) {
  if (topDepth <= 0) return 100;
  return Math.min(100, Math.round((clip / topDepth) * 100));
}
