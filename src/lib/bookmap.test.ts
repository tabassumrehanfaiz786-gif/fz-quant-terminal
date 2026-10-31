import { describe, expect, it } from 'vitest';
import { fromSnapshot } from './order-book';
import { applyMarketDepth, binDepth, bubbleRadius, MACRO_MIN, MACRO_MAX, recordVolume, volumeSince } from './bookmap';
describe('Dual Bookmap', () => {
  it('aggregates observed BTC depth in the requested 40k–100k range', () => {
    const book = fromSnapshot({ lastUpdateId: 1, bids: [['40000', '2'], ['40500', '3'], ['39999', '9']], asks: [['100000', '4'], ['100001', '8']] });
    const bins = binDepth(book, 1000, MACRO_MIN, MACRO_MAX);
    expect([...bins.entries()]).toEqual([[40000, 5], [100000, 4]]);
    expect(bins.has(60000)).toBe(false);
  });
  it('bridges a futures snapshot at its update id then requires pu continuity', () => {
    const book = fromSnapshot({ lastUpdateId: 10, bids: [['70000', '2']], asks: [] });
    expect(applyMarketDepth(book, { U: 9, u: 11, pu: 8, b: [['70000', '3']], a: [], E: 1 }, 'perps', false)).toBe('applied');
    expect(applyMarketDepth(book, { U: 12, u: 14, pu: 11, b: [['70000', '0']], a: [], E: 2 }, 'perps', true)).toBe('applied');
    expect(book.bids.has(70000)).toBe(false);
    expect(applyMarketDepth(book, { U: 15, u: 16, pu: 12, b: [['70000', '9']], a: [], E: 3 }, 'perps', true)).toBe('gap');
    expect(book.bids.has(70000)).toBe(false);
  });
  it('rejects Spot gaps rather than treating futures rules as Spot rules', () => {
    const book = fromSnapshot({ lastUpdateId: 10, bids: [], asks: [] });
    expect(applyMarketDepth(book, { U: 12, u: 13, b: [], a: [], E: 0 }, 'spot', false)).toBe('gap');
  });
  it('keeps independent buy/sell notional volume in observed windows', () => {
    const buckets: Parameters<typeof recordVolume>[0] = [];
    recordVolume(buckets, { id: 1, time: 120_000, price: 70000, qty: 2, side: 'buy' });
    recordVolume(buckets, { id: 2, time: 180_000, price: 71000, qty: 1, side: 'sell' });
    expect(volumeSince(buckets, 180_000, 1)).toEqual({ buy: 140000, sell: 71000 });
    expect(volumeSince(buckets, 300_000, 1)).toEqual({ buy: 0, sell: 0 });
  });
  it('bounds large execution bubble radii', () => { expect(bubbleRadius(1000)).toBe(18); expect(bubbleRadius(1)).toBe(4); });
});
