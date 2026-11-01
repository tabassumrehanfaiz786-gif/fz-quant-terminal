import { describe, expect, it } from 'vitest';
import { appendAbsorptionSample, freshHeavyAbsorption } from './absorption-view';
import { toIceberg, type Track } from './iceberg';

const track: Track = { price: 80_000, side: 'bid', visible: 1, shown: 1, executed: 5, refills: 0, start: 1, last: 2 };

describe('absorption view observations', () => {
  it('keeps only five minutes of real price observations without inventing missing samples', () => {
    const samples = [{ time: 0, price: 80_000, buy: 1, sell: 0 }];
    expect(appendAbsorptionSample(samples, { time: 300_001, price: 80_001, buy: 0, sell: 2 })).toEqual([
      { time: 300_001, price: 80_001, buy: 0, sell: 2 },
    ]);
    expect(appendAbsorptionSample([], { time: 1, price: 0, buy: 0, sell: 0 })).toEqual([]);
  });
  it('sounds at five BTC, but not below five BTC', () => {
    expect(freshHeavyAbsorption([toIceberg({ ...track, executed: 4.99 }, 'holding')], new Set())).toEqual([]);
    expect(freshHeavyAbsorption([toIceberg(track, 'holding')], new Set())).toEqual(['bid']);
  });
  it('does not repeat sounds when a tracked iceberg grows', () => {
    const seen = new Set<string>();
    freshHeavyAbsorption([toIceberg(track, 'holding')], seen);
    expect(freshHeavyAbsorption([toIceberg({ ...track, executed: 20 }, 'holding')], seen)).toEqual([]);
    expect(freshHeavyAbsorption([toIceberg({ ...track, start: 3 }, 'holding')], seen)).toEqual(['bid']);
  });
});