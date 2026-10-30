// Pure ATAS-style tape helpers: rounding, size tiers, filtering.
export type Print = { id: number; time: number; price: number; qty: number; side: "buy" | "sell" };
export type Tier = { name: string; minBtc: number; color: string };

export const DEFAULT_TIERS: Tier[] = [
  { name: "Retail", minBtc: 0, color: "#64748b" },
  { name: "Active", minBtc: 1, color: "#22c55e" },
  { name: "Whale", minBtc: 5, color: "#06b6d4" },
  { name: "Institutional", minBtc: 20, color: "#f59e0b" },
];

/** Round qty to nearest step (e.g. 0.1, 0.5, 1, 5, 10). step 0 = raw. */
export function roundQty(qty: number, step: number): number {
  if (!step) return qty;
  return Math.round(qty / step) * step;
}

/** Highest tier whose minimum the qty reaches. */
export function tierFor(qty: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => a.minBtc - b.minBtc);
  let t = sorted[0]!;
  for (const x of sorted) if (qty >= x.minBtc) t = x;
  return t;
}

/** Keep prints at or above the min size, using the rounded size. */
export function filterPrints(prints: Print[], minBtc: number, step: number): Print[] {
  return prints.filter((p) => roundQty(p.qty, step) >= minBtc);
}

export type Cohort = "retail" | "whale" | "institutional";
/** Retail < 1 BTC, Whale 1–10 BTC, Institutional ≥ 10 BTC. */
export function cohortFor(qty: number): Cohort {
  return qty >= 10 ? "institutional" : qty >= 1 ? "whale" : "retail";
}
