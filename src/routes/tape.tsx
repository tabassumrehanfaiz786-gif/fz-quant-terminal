import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_TIERS, cohortFor, roundQty, tierFor, type Cohort, type Print, type Tier } from "@/lib/tape";

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
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [isPaused, setPaused] = useState(false);

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
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/bookmap">Bookmap</Link></Button>
          <Button size="sm" variant={isPaused ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => { paused.current = !isPaused; setPaused(!isPaused); }}>{isPaused ? "Resume" : "Pause"}</Button>
        </div>
      </header>

      <div className="grid gap-2 xl:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-3 border border-border bg-card p-3">
          <Section title="Round size to">
            <Pills value={step} options={STEPS} fmt={(s) => (s ? `${s} BTC` : "Raw")} onChange={setStep} />
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

        <CohortTape prints={prints} step={step} tiers={tiers} />
      </div>
    </div>
  );
}

const COHORTS: { id: Cohort; label: string; range: string }[] = [
  { id: "retail", label: "Retail", range: "< 1 BTC" },
  { id: "whale", label: "Whale", range: "1 – 10 BTC" },
  { id: "institutional", label: "Institutional", range: "≥ 10 BTC" },
];

function CohortTape({ prints, step, tiers }: { prints: Print[]; step: number; tiers: Tier[] }) {
  const [tab, setTab] = useState<Cohort>("institutional");
  const groups = useMemo(() => {
    const g: Record<Cohort, Print[]> = { retail: [], whale: [], institutional: [] };
    for (const p of prints) g[cohortFor(p.qty)].push(p);
    return g;
  }, [prints]);
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex gap-1 lg:hidden">
        {COHORTS.map((c) => (
          <Button key={c.id} size="sm" variant={tab === c.id ? "default" : "outline"} className="h-8 flex-1 text-[11px]" onClick={() => setTab(c.id)}>
            {c.label} ({groups[c.id].length})
          </Button>
        ))}
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        {COHORTS.map((c) => (
          <div key={c.id} className={cn("min-w-0", tab !== c.id && "hidden lg:block")}>
            <Column title={c.label} range={c.range} prints={groups[c.id]} step={step} tiers={tiers} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Column({ title, range, prints, step, tiers }: { title: string; range: string; prints: Print[]; step: number; tiers: Tier[] }) {
  let buy = 0, sell = 0;
  for (const p of prints) p.side === "buy" ? (buy += p.qty) : (sell += p.qty);
  const delta = buy - sell;
  return (
    <div className="border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-sm font-semibold">{title}</span>
          <span className="text-[10px] text-muted-foreground">{range}</span>
        </div>
        <div className="mt-1 flex justify-between tabular-nums text-[11px]">
          <span>{prints.length} prints</span>
          <span>Vol {(buy + sell).toFixed(1)}</span>
          <span className={delta >= 0 ? "text-up" : "text-down"}>Δ {delta.toFixed(2)}</span>
        </div>
      </div>
      <div className="grid grid-cols-[70px_1fr_1fr] gap-2 border-b border-border px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Time</span><span className="text-right">Price</span><span className="text-right">BTC</span>
      </div>
      <div className="h-[calc(100vh-220px)] min-h-[420px] overflow-y-auto">
        {prints.length === 0 && <div className="p-4 text-center text-muted-foreground">Waiting for orders…</div>}
        {prints.slice(0, MAX).map((p) => {
          const q = roundQty(p.qty, step);
          const t = tierFor(q, tiers);
          return (
            <div key={p.id} className="grid grid-cols-[70px_1fr_1fr] gap-2 border-b border-border/40 px-3 py-0.5 tabular-nums"
              style={{ color: t.color, backgroundColor: `${t.color}14`, borderLeft: `3px solid ${p.side === "buy" ? "var(--up)" : "var(--down)"}` }}>
              <span className="text-muted-foreground">{new Date(p.time).toLocaleTimeString(undefined, { hour12: false })}</span>
              <span className="text-right">{p.price.toFixed(1)}</span>
              <span className="text-right">{q.toFixed(step >= 1 ? 0 : step ? 1 : 3)}</span>
            </div>
          );
        })}
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
