import type { Iceberg, Side } from './iceberg';

export type AbsorptionSample = { time: number; price: number; buy: number; sell: number };
export const ABSORPTION_WINDOW_MS = 5 * 60_000;

/** Only real observed prices enter the session chart; gaps are not filled. */
export function appendAbsorptionSample(samples: AbsorptionSample[], sample: AbsorptionSample) {
  const recent = samples.filter(s => s.time >= sample.time - ABSORPTION_WINDOW_MS);
  if (Number.isFinite(sample.price) && sample.price > 0) recent.push(sample);
  return recent.slice(-1200);
}

export function icebergIdentity(i: Pick<Iceberg, 'side' | 'price' | 'start'>) {
  return `${i.side}:${i.price}:${i.start}`;
}

/** Call with detected estimates only. One sound per tracked level, never historical replays. */
export function freshHeavyAbsorption(active: Iceberg[], seen: Set<string>) {
  const fresh: Side[] = [];
  for (const i of active) {
    const id = icebergIdentity(i);
    if (i.executed < 5 || seen.has(id)) continue;
    seen.add(id);
    fresh.push(i.side);
  }
  return fresh;
}