import { applyDepth, fromSnapshot, type Book, type DepthEvent, type DepthSnapshot } from './order-book';
export type Market = 'spot' | 'perps';
export type Execution = { id: number; time: number; price: number; qty: number; side: 'buy' | 'sell' };
export type MacroFrame = { time: number; price: number; bins: Map<number, number>; cvd: number; buy: number; sell: number; coverage: [number, number] };
export type Liquidation = { id: string; time: number; price: number; qty: number; side: 'long' | 'short' };
export type VolumeBucket = { minute: number; buy: number; sell: number };
export type MarketData = { market: Market; status: string; price: number; lastDepth: number; started: number; frames: MacroFrame[]; executions: Execution[]; tape: Execution[]; liquidations: Liquidation[]; volumes: VolumeBucket[]; cvd: number; book: Book | null; tick: number };
export const MACRO_MIN = 40_000, MACRO_MAX = 100_000, MACRO_BIN = 1000;
export function emptyMarket(market: Market): MarketData { return { market, status: 'connecting', price: 0, lastDepth: 0, started: 0, frames: [], executions: [], tape: [], liquidations: [], volumes: [], cvd: 0, book: null, tick: 0 }; }
export function applyMarketDepth(book: Book, event: DepthEvent & { pu?: number }, market: Market, bridged: boolean): 'applied' | 'stale' | 'gap' {
  if (market === 'spot') return applyDepth(book, event);
  if (event.u < book.lastId || (bridged && event.u === book.lastId)) return 'stale';
  if (bridged ? event.pu !== book.lastId : !(event.U <= book.lastId && event.u >= book.lastId)) return 'gap';
  // Futures snapshot bridging includes lastUpdateId, unlike Spot's lastUpdateId + 1.
  const next = fromSnapshot({ lastUpdateId: event.u, bids: event.b, asks: event.a });
  for (const [p, q] of event.b) { if (+q === 0) book.bids.delete(+p); }
  for (const [p, q] of event.a) { if (+q === 0) book.asks.delete(+p); }
  for (const [p, q] of next.bids) book.bids.set(p, q);
  for (const [p, q] of next.asks) book.asks.set(p, q);
  book.lastId = event.u;
  return 'applied';
}
export function binDepth(book: Book, step: number, min: number, max: number) {
  const bins = new Map<number, number>();
  for (const levels of [book.bids, book.asks]) for (const [price, qty] of levels) {
    if (price < min || price > max) continue;
    const bin = Math.floor(price / step) * step;
    bins.set(bin, (bins.get(bin) ?? 0) + qty);
  }
  return bins;
}
export function depthCoverage(book: Book): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const levels of [book.bids, book.asks]) for (const p of levels.keys()) { min = Math.min(min, p); max = Math.max(max, p); }
  return [min, max];
}
export function recordVolume(buckets: VolumeBucket[], trade: Execution) {
  const minute = Math.floor(trade.time / 60_000) * 60_000;
  let bucket = buckets.find(b => b.minute === minute);
  if (!bucket) { bucket = { minute, buy: 0, sell: 0 }; buckets.push(bucket); }
  bucket[trade.side] += trade.price * trade.qty;
  while (buckets.length && (buckets[0]?.minute ?? 0) < minute - 24 * 3600_000) buckets.shift();
}
export function volumeSince(buckets: VolumeBucket[], now: number, minutes: number) {
  return buckets.filter(b => b.minute >= now - minutes * 60_000).reduce((s, b) => ({ buy: s.buy + b.buy, sell: s.sell + b.sell }), { buy: 0, sell: 0 });
}
export function bubbleRadius(qty: number) { return Math.min(18, Math.max(2, Math.sqrt(qty) * 4)); }
export type { DepthSnapshot, DepthEvent };
