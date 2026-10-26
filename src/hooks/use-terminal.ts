import { useEffect, useRef, useState } from "react";
import { createEngine, managePrice, onCandleClose, type Candle, type EngineState } from "@/lib/strategy";

export type Interval = "1m" | "5m" | "15m";
type Feed = "connecting" | "live" | "down";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseRest = (r: any[]): Candle => ({
  time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5], buyVolume: +r[9],
});

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
    let raf = 0;
    const bump = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick((t) => t + 1); }); };
    candles.current = [];
    engines.current = { sweep: createEngine("sweep"), touch: createEngine("touch") };
    setFeed("connecting");
    setError(null);
    setHistoryReady(false);

    (async () => {
      try {
        let rows: (string | number)[][] | null = null;
        for (const host of ["https://api.binance.com", "https://data-api.binance.vision", "https://api1.binance.com"]) {
          if (cancelled) return;
          try {
            const res = await fetch(`${host}/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=1000`, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const data = await res.json();
            if (Array.isArray(data) && data.length && data.every((r) => Array.isArray(r) && r.length >= 10 && [0, 1, 2, 3, 4, 5, 9].every((i) => Number.isFinite(Number(r[i]))))) {
              rows = data;
              break;
            }
          } catch { /* Try the next public Binance endpoint. */ }
        }
        if (!rows) throw new Error("Candles unavailable");
        if (cancelled) return;
        const hist = rows.map(parseRest);
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
      ws = new WebSocket(`wss://data-stream.binance.vision/ws/btcusdt@kline_${interval}`);
      ws.onopen = () => setFeed("live");
      ws.onclose = () => !cancelled && setFeed("down");
      ws.onmessage = (ev) => {
        const k = JSON.parse(ev.data).k;
        const c: Candle = { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, buyVolume: +k.V };
        const arr = candles.current;
        const last = arr[arr.length - 1];
        if (last && last.time === c.time) arr[arr.length - 1] = c;
        else if (!last || c.time > last.time) { arr.push(c); if (arr.length > 1500) arr.shift(); }
        const { sweep, touch } = engines.current;
        for (const e of [sweep, touch]) {
          if (k.x) onCandleClose(e, c);
          else managePrice(e, c.close, c.time);
        }
        bump();
      };
    })();
    return () => { cancelled = true; ws?.close(); cancelAnimationFrame(raf); };
  }, [interval, attempt]);

  return { candles: candles.current, engines: engines.current, feed, error, historyReady, retry: () => setAttempt((n) => n + 1) };
}
