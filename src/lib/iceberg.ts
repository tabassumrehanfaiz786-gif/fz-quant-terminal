// Pure iceberg detector: compares executed tape volume at the best bid/ask
// against the most liquidity the book ever displayed at that price.
export type Side = "bid" | "ask";
export type Track = { price: number; side: Side; visible: number; shown: number; executed: number; refills: number; start: number; last: number };
export type Iceberg = Track & { hidden: number; hiddenPct: number; outcome: "holding" | "broken" | "left" };
export type IcebergConfig = { minBtc: number; ratio: number };
export type IcebergState = { bid: Track | null; ask: Track | null; found: Iceberg[] };

export const DEFAULT_ICEBERG: IcebergConfig = { minBtc: 5, ratio: 3 };
export const createIcebergState = (): IcebergState => ({ bid: null, ask: null, found: [] });

export function isIceberg(t: Track, cfg: IcebergConfig) {
  return t.executed >= cfg.minBtc && t.executed >= cfg.ratio * Math.max(t.visible, 1e-9);
}
export function toIceberg(t: Track, outcome: Iceberg["outcome"]): Iceberg {
  const hidden = Math.max(0, t.executed - t.visible);
  return { ...t, hidden, hiddenPct: t.executed ? hidden / t.executed : 0, outcome };
}

function close(s: IcebergState, side: Side, newPrice: number, cfg: IcebergConfig) {
  const t = s[side];
  if (!t || !isIceberg(t, cfg)) return;
  const broken = side === "bid" ? newPrice < t.price : newPrice > t.price;
  s.found.unshift(toIceberg(t, broken ? "broken" : "left"));
  if (s.found.length > 200) s.found.pop();
}

/** Best bid/ask update (from bookTicker). */
export function onQuote(s: IcebergState, side: Side, price: number, qty: number, time: number, cfg: IcebergConfig) {
  const t = s[side];
  if (t && t.price === price) {
    if (qty > t.shown) t.refills++;
    t.shown = qty; t.visible = Math.max(t.visible, qty); t.last = time;
    return;
  }
  close(s, side, price, cfg);
  s[side] = { price, side, visible: qty, shown: qty, executed: 0, refills: 0, start: time, last: time };
}

/** Aggressive trade (from aggTrade). buyerMaker=true means a market sell hit the bid. */
export function onTrade(s: IcebergState, price: number, qty: number, buyerMaker: boolean, time: number) {
  const t = buyerMaker ? s.bid : s.ask;
  if (t && t.price === price) { t.executed += qty; t.last = time; }
}

/** Levels currently absorbing beyond their visible size. */
export function activeIcebergs(s: IcebergState, cfg: IcebergConfig): Iceberg[] {
  return [s.bid, s.ask].filter((t): t is Track => !!t && isIceberg(t, cfg)).map((t) => toIceberg(t, "holding"));
}
