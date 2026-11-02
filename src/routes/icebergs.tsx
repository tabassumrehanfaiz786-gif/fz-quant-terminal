import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbsorptionChart, AbsorptionMeter } from "@/components/terminal/absorption-visualizer";
import { appendAbsorptionSample, freshHeavyAbsorption, type AbsorptionSample } from "@/lib/absorption-view";
import { playChime } from "@/lib/alerts";
import { cn } from "@/lib/utils";
import { activeIcebergs, createIcebergState, DEFAULT_ICEBERG, onQuote, onTrade, type Iceberg, type IcebergConfig, type Track } from "@/lib/iceberg";

export const Route = createFileRoute("/icebergs")({
  head: () => ({
    meta: [
      { title: "Iceberg Radar — FZ Quant Terminal" },
      { name: "description", content: "Live BTCUSDT bid and ask absorption meters, horizontal price levels and estimated iceberg activity from observed Binance trades." },
      { property: "og:title", content: "Iceberg Radar — FZ Quant Terminal" },
      { property: "og:description", content: "Live absorption meters and estimated hidden-order levels from Binance BTCUSDT. Participant identity is not known." },
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
  const [sound, setSound] = useState(false);
  const soundRef = useRef(sound); soundRef.current = sound;
  const [view, setView] = useState<{ live: boolean; bid: number; ask: number; bidTrack: Track | null; askTrack: Track | null; active: Iceberg[]; found: Iceberg[]; samples: AbsorptionSample[] }>({ live: false, bid: 0, ask: 0, bidTrack: null, askTrack: null, active: [], found: [], samples: [] });

  useEffect(() => {
    let ws: WebSocket | null = null, stop = false, live = false;
    let retry: ReturnType<typeof setTimeout>;
    let lastMessage = 0, price = 0, buy = 0, sell = 0;
    let samples: AbsorptionSample[] = [];
    const seen = new Set<string>();
    const connect = () => {
      const found = state.current.found;
      state.current = { ...createIcebergState(), found };
      price = 0; buy = 0; sell = 0;
      ws = new WebSocket("wss://data-stream.binance.vision/stream?streams=btcusdt@aggTrade/btcusdt@bookTicker");
      ws.onmessage = (ev) => {
        try {
          const { stream, data: d } = JSON.parse(ev.data);
          const s = state.current, now = Date.now();
          if (stream === "btcusdt@bookTicker" && +d.b > 0 && +d.a > 0) {
            onQuote(s, "bid", +d.b, +d.B, now, cfgRef.current);
            onQuote(s, "ask", +d.a, +d.A, now, cfgRef.current);
            if (!price) price = (+d.b + +d.a) / 2;
          } else if (stream === "btcusdt@aggTrade" && +d.p > 0 && +d.q > 0) {
            onTrade(s, +d.p, +d.q, d.m, now);
            price = +d.p;
            if (d.m) sell += +d.q; else buy += +d.q;
          } else return;
          live = true; lastMessage = now;
          const fresh = freshHeavyAbsorption(activeIcebergs(s, cfgRef.current), seen);
          if (soundRef.current && fresh.length) playChime("partial");
        } catch { /* Ignore malformed messages without inventing observations. */ }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => { live = false; state.current.bid = null; state.current.ask = null; if (!stop) retry = setTimeout(connect, 2000); };
    };
    connect();
    const tick = setInterval(() => {
      const s = state.current;
      const now = Date.now(), fresh = live && now - lastMessage < 10_000;
      if (fresh) samples = appendAbsorptionSample(samples, { time: now, price, buy, sell });
      buy = 0; sell = 0;
      setView({ live: fresh, bid: fresh ? s.bid?.price ?? 0 : 0, ask: fresh ? s.ask?.price ?? 0 : 0, bidTrack: fresh && s.bid ? { ...s.bid } : null, askTrack: fresh && s.ask ? { ...s.ask } : null, active: fresh ? activeIcebergs(s, cfgRef.current) : [], found: [...s.found], samples });
    }, 250);
    return () => { stop = true; clearTimeout(retry); clearInterval(tick); ws?.close(); };
  }, []);

  const totals = view.found.reduce((a, i) => { a[i.side] += i.executed; return a; }, { bid: 0, ask: 0 });
  const recent = view.samples.filter(s => s.time >= (view.samples.at(-1)?.time ?? 0) - 60_000);
  const flow = recent.reduce((a, s) => ({ buy: a.buy + s.buy, sell: a.sell + s.sell }), { buy: 0, sell: 0 });

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
          <Button size="sm" variant="outline" className="h-7 w-7 p-0" title={sound ? "Mute absorption alerts" : "Enable absorption alerts"} aria-label={sound ? "Mute absorption alerts" : "Enable absorption alerts"} aria-pressed={sound} onClick={() => setSound(!sound)}>{sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}</Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/">Dashboard</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/tape">Tape</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/desk">OTC Desk</Link></Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 p-3">
          <Pick title="Minimum absorbed" value={cfg.minBtc} options={[2, 5, 10, 25, 50]} fmt={(n) => `${n} BTC`} onChange={(minBtc) => setCfg({ ...cfg, minBtc })} />
          <Pick title="Executed vs visible" value={cfg.ratio} options={[2, 3, 5, 10]} fmt={(n) => `${n}×`} onChange={(ratio) => setCfg({ ...cfg, ratio })} />
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Session absorption</div>
            <div className="text-up">Flagged bid fills: {totals.bid.toFixed(1)} BTC</div>
            <div className="text-down">Flagged ask fills: {totals.ask.toFixed(1)} BTC</div>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">Hidden size is an estimate from observed fills versus displayed supply. Feed timing can affect it; Binance does not reveal hidden orders or institutional identity. Session observations only.</p>
        </aside>

        <section className="flex min-w-0 flex-col gap-2">
          <div className="grid gap-x-6 px-3 sm:grid-cols-2">
            <AbsorptionMeter track={view.bidTrack} side="bid" cfg={cfg} flow={flow.sell} />
            <AbsorptionMeter track={view.askTrack} side="ask" cfg={cfg} flow={flow.buy} />
          </div>
          <div className="px-3"><AbsorptionChart samples={view.samples} levels={[...view.active, ...view.found]} live={view.live} /></div>
          <div className="p-3">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Absorbing right now</div>
            {view.active.length === 0 ? <div className="text-muted-foreground">No hidden-order estimate meets the selected thresholds.</div> :
              view.active.map((i) => <Row key={i.side} i={i} />)}
          </div>
          <div className="border-t border-border">
            <div className="border-b border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Estimated iceberg log ({view.found.length})</div>
            <div className="max-h-[400px] min-h-[90px] overflow-y-auto p-2">
              {view.found.length === 0 ? <div className="p-6 text-center text-muted-foreground">No flagged levels this session.</div> :
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
    <div className={cn("mb-1 grid grid-cols-2 gap-x-3 gap-y-1 border-l-4 bg-muted/40 px-3 py-2 tabular-nums xl:grid-cols-[140px_100px_1fr_2fr_110px]", buy ? "border-up" : "border-down")}>
      <span className={cn("font-semibold", buy ? "text-up" : "text-down")}>ICEBERG {buy ? "BUY" : "SELL"} · EST.</span>
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
