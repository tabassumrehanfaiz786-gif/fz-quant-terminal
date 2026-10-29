import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { activeIcebergs, createIcebergState, DEFAULT_ICEBERG, onQuote, onTrade, type Iceberg, type IcebergConfig } from "@/lib/iceberg";

export const Route = createFileRoute("/icebergs")({
  head: () => ({
    meta: [
      { title: "Iceberg Radar — FZ Quant Terminal" },
      { name: "description", content: "Live BTCUSDT iceberg radar comparing executed tape volume with visible book depth to flag hidden orders." },
      { property: "og:title", content: "Iceberg Radar — FZ Quant Terminal" },
      { property: "og:description", content: "Flags hidden institutional BTC orders in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IcebergPage,
});

function IcebergPage() {
  const [cfg, setCfg] = useState<IcebergConfig>(DEFAULT_ICEBERG);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const state = useRef(createIcebergState());
  const [view, setView] = useState<{ live: boolean; bid: number; ask: number; active: Iceberg[]; found: Iceberg[] }>({ live: false, bid: 0, ask: 0, active: [], found: [] });

  useEffect(() => {
    let ws: WebSocket | null = null, stop = false, live = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      state.current = createIcebergState();
      ws = new WebSocket("wss://data-stream.binance.vision/stream?streams=btcusdt@aggTrade/btcusdt@bookTicker");
      ws.onopen = () => { live = true; };
      ws.onmessage = (ev) => {
        const { stream, data: d } = JSON.parse(ev.data);
        const s = state.current, now = Date.now();
        if (stream === "btcusdt@bookTicker") {
          onQuote(s, "bid", +d.b, +d.B, now, cfgRef.current);
          onQuote(s, "ask", +d.a, +d.A, now, cfgRef.current);
        } else onTrade(s, +d.p, +d.q, d.m, d.T);
      };
      ws.onclose = () => { live = false; if (!stop) retry = setTimeout(connect, 2000); };
    };
    connect();
    const tick = setInterval(() => {
      const s = state.current;
      setView({ live, bid: s.bid?.price ?? 0, ask: s.ask?.price ?? 0, active: activeIcebergs(s, cfgRef.current), found: [...s.found] });
    }, 250);
    return () => { stop = true; clearTimeout(retry); clearInterval(tick); ws?.close(); };
  }, []);

  const totals = view.found.reduce((a, i) => { a[i.side] += i.executed; return a; }, { bid: 0, ask: 0 });

  return (
    <div className="flex min-h-screen flex-col gap-2 bg-background p-2 font-mono text-xs text-foreground">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-card px-3 py-2">
        <div className="font-display text-base font-semibold">FZ<span className="text-primary">/</span>Iceberg Radar</div>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", view.live ? "bg-up animate-pulse" : "bg-down")} />
          <span className="text-muted-foreground">BINANCE · BTCUSDT · {view.live ? "LIVE" : "CONNECTING"}</span>
        </div>
        <div className="tabular-nums"><span className="text-up">{view.bid ? view.bid.toFixed(2) : "—"}</span> / <span className="text-down">{view.ask ? view.ask.toFixed(2) : "—"}</span></div>
        <div className="ml-auto flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/">Dashboard</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/tape">Tape</Link></Button>
        </div>
      </header>

      <div className="grid gap-2 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4 border border-border bg-card p-3">
          <Pick title="Minimum absorbed" value={cfg.minBtc} options={[2, 5, 10, 25, 50]} fmt={(n) => `${n} BTC`} onChange={(minBtc) => setCfg({ ...cfg, minBtc })} />
          <Pick title="Executed vs visible" value={cfg.ratio} options={[2, 3, 5, 10]} fmt={(n) => `${n}×`} onChange={(ratio) => setCfg({ ...cfg, ratio })} />
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Session absorption</div>
            <div className="text-up">Hidden buyers (bid): {totals.bid.toFixed(1)} BTC</div>
            <div className="text-down">Hidden sellers (ask): {totals.ask.toFixed(1)} BTC</div>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">An iceberg is flagged when market orders fill more at the best bid/ask than the book ever showed there, while price holds. Exchanges never reveal hidden orders; this is an estimate. History starts when you open the page.</p>
        </aside>

        <section className="flex min-w-0 flex-col gap-2">
          <div className="border border-border bg-card p-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Absorbing right now</div>
            {view.active.length === 0 ? <div className="text-muted-foreground">No level is absorbing beyond its visible size.</div> :
              view.active.map((i) => <Row key={i.side} i={i} />)}
          </div>
          <div className="border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Detected icebergs ({view.found.length})</div>
            <div className="max-h-[calc(100vh-260px)] min-h-[300px] overflow-y-auto p-2">
              {view.found.length === 0 ? <div className="p-6 text-center text-muted-foreground">Scanning the tape for hidden orders…</div> :
                view.found.map((i) => <Row key={`${i.side}-${i.price}-${i.start}`} i={i} />)}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ i }: { i: Iceberg }) {
  const buy = i.side === "bid";
  return (
    <div className={cn("mb-1 grid grid-cols-2 gap-x-3 gap-y-0.5 border-l-4 bg-muted/40 px-3 py-2 tabular-nums sm:grid-cols-[150px_110px_1fr_1fr_90px]", buy ? "border-up" : "border-down")}>
      <span className={cn("font-semibold", buy ? "text-up" : "text-down")}>🧊 ICEBERG {buy ? "BUY" : "SELL"}</span>
      <span className="text-right sm:text-left">${i.price.toFixed(2)}</span>
      <span>Absorbed {i.executed.toFixed(2)} BTC</span>
      <span>Visible {i.visible.toFixed(2)} · {Math.round(i.hiddenPct * 100)}% hidden · {i.refills} reloads</span>
      <span className={cn("text-right", i.outcome === "holding" ? "text-primary" : i.outcome === "broken" ? "text-down" : "text-muted-foreground")}>
        {i.outcome === "holding" ? "HOLDING" : i.outcome === "broken" ? "BROKEN" : "HELD"} · {new Date(i.last).toLocaleTimeString(undefined, { hour12: false })}
      </span>
    </div>
  );
}

function Pick({ title, value, options, fmt, onChange }: { title: string; value: number; options: number[]; fmt: (n: number) => string; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => <Button key={o} size="sm" variant={value === o ? "default" : "outline"} aria-pressed={value === o} className="h-7 px-2 text-[11px]" onClick={() => onChange(o)}>{fmt(o)}</Button>)}
      </div>
    </div>
  );
}
