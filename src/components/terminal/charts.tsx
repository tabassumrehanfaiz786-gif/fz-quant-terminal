import { useEffect, useRef } from "react";
import type { Candle, EngineState } from "@/lib/strategy";
import { DEFAULT_CONFIG, nearestLevel } from "@/lib/strategy";

// Canvas charts need concrete color strings; mirrors the theme tokens.
const C = { bg: "#0d0f12", grid: "#1b1f26", text: "#8a93a3", up: "#2fd391", down: "#f0565c", level: "#f5a524", zone: "#f5a52466", accent: "#58b8ff" };

type Api = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function PriceChart({ candles, engine }: { candles: Candle[]; engine: EngineState }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: Api; series: Api; markers: Api; lines: Api[]; len: number } | null>(null);
  const lib = useRef<Api>(null);

  useEffect(() => {
    let disposed = false;
    import("lightweight-charts").then((m) => {
      if (disposed || !el.current) return;
      lib.current = m;
      const chart = m.createChart(el.current, {
        autoSize: true,
        layout: { background: { color: C.bg }, textColor: C.text, fontFamily: "JetBrains Mono" },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        timeScale: { timeVisible: true, borderColor: C.grid },
        rightPriceScale: { borderColor: C.grid },
      });
      const series = chart.addSeries(m.CandlestickSeries, { upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false });
      api.current = { chart, series, markers: m.createSeriesMarkers(series, []), lines: [], len: 0 };
    });
    return () => { disposed = true; api.current?.chart.remove(); api.current = null; };
  }, []);

  useEffect(() => {
    const a = api.current;
    const last = candles[candles.length - 1];
    if (!a || !last) return;
    if (a.len !== candles.length || Math.abs(candles.length - a.len) > 1) {
      a.series.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
      a.len = candles.length;
    } else {
      a.series.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
    }
    for (const l of a.lines) a.series.removePriceLine(l);
    a.lines = [];
    const L = nearestLevel(last.close);
    const add = (price: number, color: string, title: string, style = 0, width = 1) =>
      a.lines.push(a.series.createPriceLine({ price, color, title, lineStyle: style, lineWidth: width, axisLabelVisible: true }));
    for (const lvl of [L - 10_000, L, L + 10_000]) add(lvl, C.level, `${lvl / 1000}k`, 0, 2);
    add(L + DEFAULT_CONFIG.sweepMin, C.zone, "sweep", 2);
    add(L - DEFAULT_CONFIG.sweepMin, C.zone, "sweep", 2);
    const p = engine.position;
    if (p) {
      add(p.entry, C.accent, "entry", 0);
      add(p.stop, C.down, p.beMoved ? "BE stop" : "stop", 1);
      if (!p.tp1Hit) add(p.tp1, C.up, "TP1", 1);
    }
    const first = candles[0]?.time;
    if (first === undefined) return;
    a.markers.setMarkers(
      engine.markers.filter((m) => m.time >= first).map((m) => ({
        time: m.time,
        position: m.kind === "entry-long" ? "belowBar" : m.kind === "entry-short" ? "aboveBar" : m.kind === "sweep" ? (m.text && "inBar") : "aboveBar",
        shape: m.kind === "entry-long" ? "arrowUp" : m.kind === "entry-short" ? "arrowDown" : m.kind === "sweep" ? "square" : "circle",
        color: m.kind === "entry-long" ? C.up : m.kind === "entry-short" ? C.down : m.kind === "sweep" ? C.level : C.accent,
        text: m.text,
      })),
    );
  });

  return <div ref={el} className="h-full w-full" />;
}

export function EquityChart({ engine }: { engine: EngineState }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ chart: Api; series: Api } | null>(null);
  useEffect(() => {
    let disposed = false;
    import("lightweight-charts").then((m) => {
      if (disposed || !el.current) return;
      const chart = m.createChart(el.current, {
        autoSize: true,
        layout: { background: { color: C.bg }, textColor: C.text, fontFamily: "JetBrains Mono" },
        grid: { vertLines: { visible: false }, horzLines: { color: C.grid } },
        timeScale: { timeVisible: true, borderColor: C.grid },
        rightPriceScale: { borderColor: C.grid },
      });
      const series = chart.addSeries(m.AreaSeries, { lineColor: C.level, topColor: "#f5a52455", bottomColor: "#f5a52405", lineWidth: 2 });
      api.current = { chart, series };
    });
    return () => { disposed = true; api.current?.chart.remove(); api.current = null; };
  }, []);
  useEffect(() => {
    const seen = new Set<number>();
    const data = engine.equity.filter((e) => (seen.has(e.time) ? false : (seen.add(e.time), true))).map((e) => ({ time: e.time, value: e.value }));
    api.current?.series.setData(data);
  });
  return <div ref={el} className="h-full w-full" />;
}
