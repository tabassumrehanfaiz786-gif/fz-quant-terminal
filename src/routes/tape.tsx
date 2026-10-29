import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_TIERS, filterPrints, roundQty, tierFor, type Print, type Tier } from "@/lib/tape";

export const Route = createFileRoute("/tape")({
  head: () => ({
    meta: [
      { title: "Tape — FZ Quant Terminal" },
      { name: "description", content: "ATAS-style live BTCUSDT time & sales with order-size rounding, filters and color tiers." },
      { property: "og:title", content: "Tape — FZ Quant Terminal" },
      { property: "og:description", content: "Live BTCUSDT time & sales with size filters and color tiers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TapePage,
});

const MAX = 400;
const STEPS = [0, 0.1, 0.5, 1, 5, 10];
const MINS = [0, 0.5, 1, 5, 20];

function useTape() {
  const [prints, setPrints] = useState<Print[]>([]);
  const [live, setLive] = useState(false);
  const paused = useRef(false);
  const buf = useRef<Print[]>([]);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@aggTrade");
      ws.onopen = () => setLive(true);
      ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        buf.current.push({ id: d.a, time: d.T, price: +d.p, qty: +d.q, side: d.m ? "sell" : "buy" });
      };
      ws.onclose = () => { setLive(false); if (!stop) retry = setTimeout(connect, 2000); };
    };
    connect();
    const flush = setInterval(() => {
      if (paused.current || !buf.current.length) return;
      const b = buf.current.reverse(); buf.current = [];
      setPrints((p) => [...b, ...p].slice(0, MAX * 5));
    }, 150);
    return () => { stop = true; clearTimeout(retry); clearInterval(flush); ws?.close(); };
  }, []);
  return { prints, live, paused };
}

function TapePage() {
  const { prints, live, paused } = useTape();
  const [step, setStep] = useState(0.1);
  const [minBtc, setMinBtc] = useState(0.5);
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [isPaused, setPaused] = useState(false);

  const shown = useMemo(() => filterPrints(prints, minBtc, step).slice(0, MAX), [prints, minBtc, step]);
  const stats = useMemo(() => {
    const cut = Date.now() - 60_000;
    let buy = 0, sell = 0, n = 0;
    for (const p of prints) { if (p.time < cut) break; n++; if (p.side === "buy") buy += p.qty; else sell += p.qty; }
    return { buy, sell, delta: buy - sell, tps: n / 60 };
  }, [prints]);
  const price = prints[0]?.price;
  const total = stats.buy + stats.sell || 1;

  const updateTier = (i: number, patch: Partial<Tier>) => setTiers((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="flex min-h-screen flex-col gap-2 bg-background p-2 font-mono text-xs text-foreground">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-card px-3 py-2">
        <div className="font-display text-base font-semibold">FZ<span className="text-primary">/</span>Quant Tape</div>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", live ? "bg-up animate-pulse" : "bg-down")} />
          <span className="text-muted-foreground">BINANCE · BTCUSDT · {live ? "LIVE" : "CONNECTING"}</span>
        </div>
        <div className="text-lg font-semibold tabular-nums">{price ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</div>
        <div className="ml-auto flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/">Dashboard</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/icebergs">Icebergs</Link></Button>
          <Button size="sm" variant={isPaused ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => { paused.current = !isPaused; setPaused(!isPaused); }}>{isPaused ? "Resume" : "Pause"}</Button>
        </div>
      </header>

      <div className="grid gap-2 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-3 border border-border bg-card p-3">
          <Section title="Round size to">
            <Pills value={step} options={STEPS} fmt={(s) => (s ? `${s} BTC` : "Raw")} onChange={setStep} />
          </Section>
          <Section title="Minimum size">
            <Pills value={minBtc} options={MINS} fmt={(s) => (s ? `≥ ${s}` : "All")} onChange={setMinBtc} />
          </Section>
          <Section title="Color tiers (BTC ≥)">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="color" aria-label={`${t.name} color`} value={t.color} onChange={(e) => updateTier(i, { color: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" />
                <span className="w-24">{t.name}</span>
                <input type="number" min={0} step={0.5} aria-label={`${t.name} minimum`} value={t.minBtc} onChange={(e) => updateTier(i, { minBtc: Math.max(0, +e.target.value) })} className="w-20 border border-border bg-background px-2 py-1 tabular-nums" />
              </div>
            ))}
            <button className="self-start text-muted-foreground underline" onClick={() => setTiers(DEFAULT_TIERS)}>Reset tiers</button>
          </Section>
          <Section title="Last 60s">
            <div className="flex h-2 overflow-hidden bg-muted">
              <div className="bg-up" style={{ width: `${(stats.buy / total) * 100}%` }} />
              <div className="bg-down flex-1" />
            </div>
            <div className="flex justify-between tabular-nums"><span className="text-up">Buy {stats.buy.toFixed(1)}</span><span className="text-down">Sell {stats.sell.toFixed(1)}</span></div>
            <div className="tabular-nums">Delta <span className={stats.delta >= 0 ? "text-up" : "text-down"}>{stats.delta.toFixed(2)} BTC</span> · {stats.tps.toFixed(1)} prints/s</div>
          </Section>
        </aside>

        <section className="min-w-0 border border-border bg-card">
          <div className="grid grid-cols-[90px_1fr_1fr_1fr] gap-2 border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground sm:grid-cols-[110px_60px_1fr_1fr_1fr]">
            <span>Time</span><span className="hidden sm:block">Side</span><span className="text-right">Price</span><span className="text-right">Size BTC</span><span className="text-right">USD</span>
          </div>
          <div className="h-[calc(100vh-110px)] min-h-[500px] overflow-y-auto">
            {shown.length === 0 && <div className="p-6 text-center text-muted-foreground">Waiting for prints matching your filter…</div>}
            {shown.map((p) => {
              const q = roundQty(p.qty, step);
              const t = tierFor(q, tiers);
              const big = t.minBtc >= (tiers[tiers.length - 1]?.minBtc ?? Infinity);
              return (
                <div key={p.id} className={cn("grid grid-cols-[90px_1fr_1fr_1fr] gap-2 border-b border-border/40 px-3 py-1 tabular-nums sm:grid-cols-[110px_60px_1fr_1fr_1fr]", big && "font-semibold")}
                  style={{ color: t.color, backgroundColor: `${t.color}${big ? "33" : "14"}`, borderLeft: `3px solid ${p.side === "buy" ? "var(--up)" : "var(--down)"}` }}>
                  <span className="text-muted-foreground">{new Date(p.time).toLocaleTimeString(undefined, { hour12: false })}.{String(p.time % 1000).padStart(3, "0")}</span>
                  <span className="hidden sm:block">{p.side.toUpperCase()}</span>
                  <span className="text-right">{p.price.toFixed(2)}</span>
                  <span className="text-right">{q.toFixed(step >= 1 ? 0 : step ? 1 : 4)}</span>
                  <span className="text-right">${Math.round(q * p.price).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>{children}</div>;
}

function Pills({ value, options, fmt, onChange }: { value: number; options: number[]; fmt: (n: number) => string; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <Button key={o} size="sm" variant={value === o ? "default" : "outline"} aria-pressed={value === o} className="h-7 px-2 text-[11px]" onClick={() => onChange(o)}>{fmt(o)}</Button>
      ))}
    </div>
  );
}
