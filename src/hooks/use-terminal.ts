import { useEffect, useRef, useState } from "react";
import { createEngine, managePrice, onCandleClose, type Candle, type EngineState } from "@/lib/strategy";
import { CB_REST, openMatches } from "@/lib/coinbase";

export type Interval = "1m" | "5m" | "15m";
type Feed = "connecting" | "live" | "down";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseRest = (r: any[]): Candle => ({
  time: +r[0], low: +r[1], high: +r[2], open: +r[3], close: +r[4], volume: +r[5], buyVolume: +r[5] / 2,
});
const GRAN: Record<Interval, number> = { "1m": 60, "5m": 300, "15m": 900 };

export function useTerminal(interval: Interval) {
  const [, setTick] = useState(0);
  const [feed, setFeed] = useState<Feed>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [historyReady, setHistoryReady] = useState(false);
  const candles = useRef<Candle[]>([]);
  const engines = useRef<{ sweep: EngineState; touch: EngineState }>({ sweep: createEngine("sweep"), touch: createEngine("touch") });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;
    const gran = GRAN[interval];
    let raf = 0;
    const bump = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick((t) => t + 1); }); };
    candles.current = [];
    engines.current = { sweep: createEngine("sweep"), touch: createEngine("touch") };
    setFeed("connecting");
    setError(null);
    setHistoryReady(false);

    (async () => {
      try {
        // Coinbase returns max 300 candles per call, newest first: [time, low, high, open, close, volume].
        const byTime = new Map<number, Candle>();
        let end = Math.floor(Date.now() / 1000);
        for (let page = 0; page < 4; page++) {
          if (cancelled) return;
          const start = end - gran * 300;
          const res = await fetch(`${CB_REST}/products/BTC-USD/candles?granularity=${gran}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) break;
          const data = await res.json();
          if (!Array.isArray(data) || !data.length) break;
          for (const r of data) if (Array.isArray(r) && r.length >= 6) byTime.set(+r[0], parseRest(r));
          end = start;
        }
        if (!byTime.size) throw new Error("Candles unavailable");
        if (cancelled) return;
        const hist = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-1000);
        const closed = hist.slice(0, -1);
        const { sweep, touch } = engines.current;
        for (const e of [sweep, touch]) {
          e.audit.push({ time: closed[0]?.time ?? 0, kind: "SYSTEM", message: `Replaying ${closed.length} ${interval} candles, balance $${e.cfg.startBalance.toLocaleString()}` });
          for (const c of closed) onCandleClose(e, c);
          e.audit.push({ time: hist.at(-1)?.time ?? 0, kind: "SYSTEM", message: "Replay complete — live paper execution armed" });
          const current = hist.at(-1);
          if (current) managePrice(e, current.close, current.time);
        }
        candles.current = hist;
        setHistoryReady(true);
        bump();
      } catch {
        if (cancelled) return;
        setFeed("down");
        setError("Binance candle history is unavailable. Paper results are incomplete.");
      }
      if (cancelled) return;
      // Build live candles from Coinbase trade prints.
      ws = openMatches((m) => {
        if (m.time / 1000 < (candles.current.at(-1)?.time ?? 0)) return;
        const t = Math.floor(m.time / 1000 / gran) * gran;
        const arr = candles.current;
        const last = arr[arr.length - 1];
        const { sweep, touch } = engines.current;
        if (last && last.time === t) {
          last.high = Math.max(last.high, m.price); last.low = Math.min(last.low, m.price); last.close = m.price;
          last.volume += m.qty; if (m.side === "buy") last.buyVolume += m.qty;
        } else if (!last || t > last.time) {
          if (last) for (const e of [sweep, touch]) onCandleClose(e, last);
          arr.push({ time: t, open: m.price, high: m.price, low: m.price, close: m.price, volume: m.qty, buyVolume: m.side === "buy" ? m.qty : 0 });
          if (arr.length > 1500) arr.shift();
        }
        for (const e of [sweep, touch]) managePrice(e, m.price, t);
        bump();
      }, () => setFeed("live"), () => { if (!cancelled) setFeed("down"); });
    })();
    return () => { cancelled = true; ws?.close(); cancelAnimationFrame(raf); };
  }, [interval, attempt]);

  return { candles: candles.current, engines: engines.current, feed, error, historyReady, retry: () => setAttempt((n) => n + 1) };
}
