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

export type RadarTier = "stealth" | "borderline" | "detected";
/** Classify exposure: below stealthMax = stealth, above detectedMin = detected. */
export function radarTier(exposure: number, stealthMax = 20, detectedMin = 50): RadarTier {
  if (exposure < stealthMax) return "stealth";
  if (exposure > detectedMin) return "detected";
  return "borderline";
}

/** Stealth (0-100, higher = more hidden) from clip share of a depth figure. */
const share = (clip: number, depth: number) => (depth > 0 ? Math.max(0, 100 - Math.min(100, (clip / depth) * 100)) : 0);

/** Size randomness of child clips: coefficient of variation mapped to 0-100 (30%+ CV = fully random). */
export function sizeEntropy(clips: number[]) {
  if (clips.length < 2) return 0;
  const m = clips.reduce((a, b) => a + b, 0) / clips.length;
  const sd = Math.sqrt(clips.reduce((s, c) => s + (c - m) ** 2, 0) / clips.length);
  return m ? Math.min(100, Math.round((sd / m / 0.3) * 100)) : 0;
}

export interface MultiVector { top: number; l5: number; entropy: number; composite: number; tier: RadarTier }
/** Composite stealth: 40% top-of-book, 35% five-level depth, 25% clip-size randomness. */
export function multiVectorStealth(clip: number, levels: Lvl[], clips: number[], stealthMax = 20, detectedMin = 50): MultiVector {
  const top = Math.round(share(clip, levels[0]?.[1] ?? 0));
  const l5 = Math.round(share(clip, levels.slice(0, 5).reduce((s, [, q]) => s + q, 0)));
  const entropy = sizeEntropy(clips);
  const composite = Math.round(top * 0.4 + l5 * 0.35 + entropy * 0.25);
  return { top, l5, entropy, composite, tier: radarTier(100 - composite, stealthMax, detectedMin) };
}

export interface TicketInput { side: Side; qty: number; mid: number; sweepAvg: number; sweepFilled: number; rfqPrice: number; rfqBps: number; stealth: number; time: Date }
/** Simulated compliance ticket. Not a regulatory filing. */
export function complianceTicket(t: TicketInput) {
  const notional = t.qty * t.mid;
  const sign = t.side === "buy" ? 1 : -1;
  const savedUsd = sign * (t.sweepAvg - t.rfqPrice) * t.sweepFilled;
  const savedBps = t.sweepAvg ? (sign * (t.sweepAvg - t.rfqPrice) / t.sweepAvg) * 10_000 : 0;
  let h = 2166136261;
  for (const ch of `${t.time.toISOString()}|${t.side}|${t.qty}|${t.rfqPrice}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return {
    id: "SIM-" + h.toString(16).toUpperCase().padStart(8, "0"),
    timestamp: t.time.toISOString(), instrument: "BTCUSDT", side: t.side.toUpperCase(), qty: t.qty,
    notional: Math.round(notional), lisThreshold: LIS_NOTIONAL, lisMet: isLargeInScale(notional),
    sweepAvg: +t.sweepAvg.toFixed(2), rfqPrice: +t.rfqPrice.toFixed(2), rfqSpreadBps: +t.rfqBps.toFixed(2),
    savedUsd: +savedUsd.toFixed(2), savedBps: +savedBps.toFixed(2), bestVenue: savedUsd > 0 ? "OTC RFQ" : "Public book",
    stealthScore: t.stealth,
  };
}
export type Ticket = ReturnType<typeof complianceTicket>;

export function ticketText(k: Ticket) {
  return [
    "SIMULATED BEST-EXECUTION & TRANSPARENCY TICKET (not a regulatory filing)",
    `Ticket ID: ${k.id}`, `Time (UTC): ${k.timestamp}`, `Instrument: ${k.instrument}  Side: ${k.side}  Size: ${k.qty} BTC`,
    `Notional: $${k.notional.toLocaleString()}`,
    `Large-in-Scale (illustrative $${k.lisThreshold.toLocaleString()}): ${k.lisMet ? "MET - pre-trade waiver eligible" : "NOT MET - public pre-trade transparency applies"}`,
    `Public book sweep avg: $${k.sweepAvg}`, `OTC RFQ price: $${k.rfqPrice} (${k.rfqSpreadBps} bps)`,
    `RFQ vs sweep: ${k.savedUsd >= 0 ? "saves" : "costs"} $${Math.abs(k.savedUsd).toLocaleString()} (${k.savedBps} bps)`,
    `Best venue on price: ${k.bestVenue}`, `Composite stealth score: ${k.stealthScore}/100`,
    "Checklist: no layering/spoofing pattern; clips randomised; venue comparison recorded.",
  ].join("\n");
}
