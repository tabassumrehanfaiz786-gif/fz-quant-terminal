export type Level = [string, string];
export type DepthEvent = { U: number; u: number; b: Level[]; a: Level[]; E: number };
export type DepthSnapshot = { lastUpdateId: number; bids: Level[]; asks: Level[] };
export type Book = { bids: Map<number, number>; asks: Map<number, number>; lastId: number };
export type Liquidity = { price: number; qty: number; side: "bid" | "ask" };
export type HeatFrame = { time: number; price: number; bins: Map<number, number>; walls: Liquidity[] };
export const SAMPLE_MS = 500;
export const MAX_FRAMES = 600;
export const BIN_SIZE = 5;

function update(map: Map<number, number>, levels: Level[]) {
  for (const [p, q] of levels) {
    const price = Number(p), qty = Number(q);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || price <= 0 || qty < 0) continue;
    if (qty === 0) map.delete(price);
    else map.set(price, qty);
  }
}
export function fromSnapshot(s: DepthSnapshot): Book {
  const book: Book = { bids: new Map(), asks: new Map(), lastId: s.lastUpdateId };
  update(book.bids, s.bids); update(book.asks, s.asks);
  return book;
}
export function applyDepth(book: Book, event: DepthEvent): "applied" | "stale" | "gap" {
  if (event.u <= book.lastId) return "stale";
  if (event.U > book.lastId + 1) return "gap";
  update(book.bids, event.b); update(book.asks, event.a);
  book.lastId = event.u;
  return "applied";
}
export function bookLevels(book: Book): Liquidity[] {
  return [ ...Array.from(book.bids, ([price, qty]) => ({ price, qty, side: "bid" as const })),
    ...Array.from(book.asks, ([price, qty]) => ({ price, qty, side: "ask" as const })) ];
}
export function detectWalls(levels: Liquidity[], minimumNotional: number): Liquidity[] {
  return levels.filter(l => l.price * l.qty >= minimumNotional).sort((a, b) => b.price * b.qty - a.price * a.qty);
}
export function captureFrame(book: Book, price: number, time: number): HeatFrame {
  const bins = new Map<number, number>();
  const levels = bookLevels(book);
  for (const l of levels) {
    if (Math.abs(l.price - price) > 2000) continue;
    const bin = Math.floor(l.price / BIN_SIZE) * BIN_SIZE;
    bins.set(bin, (bins.get(bin) ?? 0) + l.qty * l.price);
  }
  return { time, price, bins, walls: detectWalls(levels, 100_000) };
}