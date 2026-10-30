// Pure paper-trading engine for the BTCUSDT 10k-level strategy.
export type Mode = "sweep" | "touch";
export type Side = "long" | "short";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number; // taker buy base volume
}

export interface Config {
  startBalance: number;
  positionUsd: number;
  stopCap: number;
  beTrigger: number;
  tp1Distance: number;
  tp1Fraction: number;
  touchBand: number;
  sweepMin: number;
  stopBuffer: number;
  rearmDistance: number;
  regimeAtrMax: number;
  feeRate: number;
  stopReverse: boolean;
}

export const DEFAULT_CONFIG: Config = {
  startBalance: 100_000,
  positionUsd: 50_000,
  stopCap: 2_500,
  beTrigger: 2_500,
  tp1Distance: 2_500,
  tp1Fraction: 0.5,
  touchBand: 150,
  sweepMin: 100,
  stopBuffer: 50,
  rearmDistance: 1_000,
  regimeAtrMax: 1_200,
  feeRate: 0.0004,
  stopReverse: true,
};

export interface Position {
  side: Side;
  level: number;
  entry: number;
  entryTime: number;
  qty: number;
  initialQty: number;
  stop: number;
  tp1: number;
  target: number;
  tp1Hit: boolean;
  beMoved: boolean;
  realized: number;
  flip?: boolean;
}

export interface Trade {
  id: number;
  side: Side;
  level: number;
  entry: number;
  exit: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  reason: string;
}

export type AuditKind = "ENTRY" | "EXIT" | "PARTIAL" | "RISK" | "REJECT" | "REARM" | "SYSTEM";
export interface AuditEntry {
  time: number;
  kind: AuditKind;
  message: string;
}

export interface Marker {
  time: number;
  kind: "entry-long" | "entry-short" | "exit" | "sweep";
  text: string;
  price: number;
}

export interface EngineState {
  mode: Mode;
  cfg: Config;
  balance: number;
  position: Position | null;
  trades: Trade[];
  audit: AuditEntry[];
  equity: { time: number; value: number }[];
  markers: Marker[];
  armed: Record<number, boolean>;
  cvd: number;
  ranges: number[];
  nextId: number;
}

export function createEngine(mode: Mode, cfg: Config = DEFAULT_CONFIG): EngineState {
  return {
    mode, cfg, balance: cfg.startBalance, position: null, trades: [], audit: [],
    equity: [], markers: [], armed: {}, cvd: 0, ranges: [], nextId: 1,
  };
}

export const nearestLevel = (p: number) => Math.round(p / 10_000) * 10_000;
export const nextLevelAbove = (p: number) => (Math.floor(p / 10_000) + 1) * 10_000;
export const nextLevelBelow = (p: number) => (Math.ceil(p / 10_000) - 1) * 10_000;

const log = (s: EngineState, time: number, kind: AuditKind, message: string) => {
  s.audit.push({ time, kind, message });
  if (s.audit.length > 500) s.audit.shift();
};

export function unrealized(s: EngineState, price: number) {
  const p = s.position;
  if (!p) return 0;
  return (price - p.entry) * p.qty * (p.side === "long" ? 1 : -1);
}

function closeQty(s: EngineState, qty: number, price: number, time: number, reason: string, final: boolean) {
  const p = s.position!;
  const dir = p.side === "long" ? 1 : -1;
  const pnl = (price - p.entry) * qty * dir - price * qty * s.cfg.feeRate;
  s.balance += pnl;
  p.realized += pnl;
  p.qty -= qty;
  if (final || p.qty <= 1e-9) {
    s.trades.push({
      id: s.nextId++, side: p.side, level: p.level, entry: p.entry, exit: price,
      entryTime: p.entryTime, exitTime: time, pnl: p.realized, reason,
    });
    s.markers.push({ time, kind: "exit", text: `${reason} ${p.realized >= 0 ? "+" : ""}${p.realized.toFixed(0)}`, price });
    log(s, time, "EXIT", `${p.side.toUpperCase()} closed @ ${price.toFixed(1)} (${reason}) PnL ${p.realized.toFixed(2)}`);
    s.position = null;
  } else {
    log(s, time, "PARTIAL", `TP1 partial ${qty.toFixed(4)} BTC @ ${price.toFixed(1)} PnL ${pnl.toFixed(2)}`);
  }
}

/** Manage the open position against a single traded price. */
export function managePrice(s: EngineState, price: number, time: number) {
  const p = s.position;
  if (!p) return;
  const dir = p.side === "long" ? 1 : -1;
  const move = (price - p.entry) * dir;
  if ((price - p.stop) * dir <= 0) {
    closeQty(s, p.qty, p.stop, time, p.beMoved ? "BE STOP" : "STOP", true);
    // Stop & reverse: a full-risk stop flips once; the new stop sits beyond the 10k level (still capped).
    if (s.cfg.stopReverse && !p.beMoved && !p.flip) {
      const side: Side = p.side === "long" ? "short" : "long";
      const structure = side === "short" ? p.level + s.cfg.stopBuffer : p.level - s.cfg.stopBuffer;
      open(s, side, p.level, p.stop, structure, time, "stop & reverse");
      s.position!.flip = true;
    }
    return;
  }
  if (!p.tp1Hit && move >= s.cfg.tp1Distance) {
    p.tp1Hit = true;
    closeQty(s, p.initialQty * s.cfg.tp1Fraction, p.tp1, time, "TP1", false);
  }
  if (!p.beMoved && move >= s.cfg.beTrigger) {
    p.beMoved = true;
    p.stop = p.entry;
    log(s, time, "RISK", `Stop moved to break-even @ ${p.entry.toFixed(1)}`);
  }
  if (s.position && (price - p.target) * dir >= 0) {
    closeQty(s, p.qty, p.target, time, "RUNNER", true);
  }
}

function atr(s: EngineState) {
  if (!s.ranges.length) return 0;
  return s.ranges.reduce((a, b) => a + b, 0) / s.ranges.length;
}

function open(s: EngineState, side: Side, level: number, entry: number, structureStop: number, time: number, why: string) {
  const c = s.cfg;
  const capped = side === "long" ? Math.max(structureStop, entry - c.stopCap) : Math.min(structureStop, entry + c.stopCap);
  const qty = c.positionUsd / entry;
  s.balance -= entry * qty * c.feeRate;
  s.position = {
    side, level, entry, entryTime: time, qty, initialQty: qty, stop: capped,
    tp1: side === "long" ? entry + c.tp1Distance : entry - c.tp1Distance,
    target: side === "long" ? nextLevelAbove(entry) : nextLevelBelow(entry),
    tp1Hit: false, beMoved: false, realized: -entry * qty * c.feeRate,
  };
  s.armed[level] = false;
  s.markers.push({ time, kind: side === "long" ? "entry-long" : "entry-short", text: `${side === "long" ? "BUY" : "SELL"} ${level / 1000}k`, price: entry });
  log(s, time, "ENTRY", `${side.toUpperCase()} ${qty.toFixed(4)} BTC ($${c.positionUsd.toLocaleString()}) @ ${entry.toFixed(1)} — ${why}`);
  log(s, time, "RISK", `Stop ${capped.toFixed(1)} (distance $${Math.abs(entry - capped).toFixed(0)}, cap $${c.stopCap}) · TP1 ${s.position.tp1.toFixed(0)} · Runner ${s.position.target}`);
}

/** Process a fully closed candle: manage, re-arm, then evaluate entries. */
export function onCandleClose(s: EngineState, k: Candle) {
  const c = s.cfg;
  // manage intrabar conservatively: adverse extreme first
  if (s.position) {
    const seq = s.position.side === "long" ? [k.low, k.high, k.close] : [k.high, k.low, k.close];
    for (const px of seq) managePrice(s, px, k.time);
  }
  const delta = 2 * k.buyVolume - k.volume;
  s.cvd += delta;
  const L = nearestLevel(k.close);

  // re-arm levels after a clean move away
  for (const key of Object.keys(s.armed)) {
    const lvl = Number(key);
    if (!s.armed[lvl] && Math.abs(k.close - lvl) >= c.rearmDistance) {
      s.armed[lvl] = true;
      log(s, k.time, "REARM", `${lvl / 1000}k re-armed after $${c.rearmDistance} departure`);
    }
  }

  const a = atr(s);
  s.ranges.push(k.high - k.low);
  if (s.ranges.length > 14) s.ranges.shift();

  if (!s.position) {
    const touched = k.low <= L + c.touchBand && k.high >= L - c.touchBand;
    if (touched && s.armed[L] === false) {
      log(s, k.time, "REJECT", `${L / 1000}k touched but awaiting clean retest (re-entry control)`);
    } else if (s.mode === "touch") {
      if (touched) {
        const side: Side = k.open >= L ? "long" : "short";
        open(s, side, L, k.close, side === "long" ? k.close - c.stopCap : k.close + c.stopCap, k.time, "10k touch");
      }
    } else {
      const sweptBelow = k.low <= L - c.sweepMin && k.close > L;
      const sweptAbove = k.high >= L + c.sweepMin && k.close < L;
      if (sweptBelow || sweptAbove) {
        const side: Side = sweptBelow ? "long" : "short";
        s.markers.push({ time: k.time, kind: "sweep", text: "SWEEP", price: sweptBelow ? k.low : k.high });
        const range = k.high - k.low || 1;
        const wick = sweptBelow ? (k.close - k.low) / range : (k.high - k.close) / range;
        const absorbed = sweptBelow ? delta < 0 || wick > 0.6 : delta > 0 || wick > 0.6;
        const regimeOk = a === 0 || (a <= c.regimeAtrMax && range <= 4 * a);
        if (!absorbed) log(s, k.time, "REJECT", `Sweep at ${L / 1000}k without absorption (delta ${delta.toFixed(1)})`);
        else if (!regimeOk) log(s, k.time, "REJECT", `Regime filter: ATR ${a.toFixed(0)} / range ${range.toFixed(0)} too volatile`);
        else {
          const stop = sweptBelow ? k.low - c.stopBuffer : k.high + c.stopBuffer;
          open(s, side, L, k.close, stop, k.time, `sweep & reclaim, delta ${delta.toFixed(1)}, ATR ${a.toFixed(0)}`);
        }
      }
    }
  }
  s.equity.push({ time: k.time, value: s.balance + unrealized(s, k.close) });
  if (s.equity.length > 5000) s.equity.shift();
}

export function stats(s: EngineState) {
  const wins = s.trades.filter((t) => t.pnl > 0).length;
  return {
    trades: s.trades.length,
    wins,
    winRate: s.trades.length ? (wins / s.trades.length) * 100 : 0,
    realized: s.trades.reduce((a, t) => a + t.pnl, 0),
  };
}
