import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LIS_NOTIONAL, complianceTicket, isLargeInScale, multiVectorStealth, ticketText, type Ticket, radarScore, rfqQuote, sliceIntervals, sliceOrder, sweep, type Lvl, type RadarTier, type Side } from "@/lib/desk";

const TIER: Record<RadarTier, { label: string; bar: string; badge: string; text: string }> = {
  stealth: { label: "Stealth", bar: "bg-primary", badge: "bg-primary/15 text-primary", text: "Undetected — blends into normal flow." },
  borderline: { label: "Borderline", bar: "bg-accent", badge: "bg-accent/20 text-accent-foreground", text: "Moderate footprint — may trigger order-book alerts." },
  detected: { label: "Detected", bar: "bg-destructive", badge: "bg-destructive/15 text-destructive", text: "High footprint — iceberg detectors will spot it." },
};

export const Route = createFileRoute("/desk")({
  head: () => ({
    meta: [
      { title: "OTC & Stealth Execution Desk — FZ Quant Terminal" },
      { name: "description", content: "Simulated BTC block execution: OTC RFQ quotes, iceberg slicing and market-impact vs. the live Binance book." },
      { property: "og:title", content: "OTC & Stealth Execution Desk — FZ Quant Terminal" },
      { property: "og:description", content: "Compare sweeping the live book, private RFQ quotes and hidden iceberg slicing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeskPage,
});

function useBook() {
  const [book, setBook] = useState<{ bids: Lvl[]; asks: Lvl[] }>({ bids: [], asks: [] });
  const [live, setLive] = useState(false);
  const [tapeRate, setTapeRate] = useState(0); // BTC per second, rolling 30s
  useEffect(() => {
    let ws: WebSocket | null = null, stop = false, n = 0, t: ReturnType<typeof setTimeout>;
    const trades: [number, number][] = [];
    const tick = setInterval(() => {
      const cut = Date.now() - 30_000;
      while (trades.length && trades[0]![0] < cut) trades.shift();
      setTapeRate(trades.reduce((s, [, q]) => s + q, 0) / 30);
    }, 1000);
    const connect = () => {
      ws = new WebSocket(`${n++ % 2 ? "wss://stream.binance.com:9443" : "wss://data-stream.binance.vision"}/stream?streams=btcusdt@depth20@100ms/btcusdt@aggTrade`);
      ws.onopen = () => setLive(true);
      ws.onmessage = (e) => {
        const { stream, data: d } = JSON.parse(e.data);
        if (stream?.endsWith("aggTrade")) { trades.push([Date.now(), +d.q]); return; }
        const m = (l: [string, string][]): Lvl[] => l.map(([p, q]) => [+p, +q]);
        setBook({ bids: m(d.bids), asks: m(d.asks) });
      };
      ws.onclose = () => { setLive(false); if (!stop) t = setTimeout(connect, 2000); };
    };
    connect();
    return () => { stop = true; clearTimeout(t); clearInterval(tick); ws?.close(); };
  }, []);
  return { ...book, live, tapeRate };
}

const usd = (n: number) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function DeskPage() {
  const { bids, asks, live, tapeRate } = useBook();
  const [side, setSide] = useState<Side>("buy");
  const [qty, setQty] = useState(25);
  const [clip, setClip] = useState(0.5);
  const [run, setRun] = useState<{ clips: number[]; gaps: number[]; done: number; fills: number[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mid = bids[0] && asks[0] ? (bids[0][0] + asks[0][0]) / 2 : 0;
  const levels = side === "buy" ? asks : bids;
  const sw = useMemo(() => sweep(levels, qty), [levels, qty]);
  const rfq = mid ? rfqQuote(mid, qty, side) : null;
  const notional = qty * mid;
  const lis = isLargeInScale(notional);
  const radar = radarScore(clip, levels[0]?.[1] ?? 0);
  const [stealthMax, setStealthMax] = useState(20);
  const [detectedMin, setDetectedMin] = useState(50);
  const previewClips = useMemo(() => run?.clips ?? sliceOrder(Math.min(qty, clip * 40), clip, 7), [run, qty, clip]);
  const previewGaps = useMemo(() => run?.gaps ?? sliceIntervals(previewClips.length, 400, 18), [run, previewClips]);
  const mv = multiVectorStealth(clip, levels, previewClips, { intervalsMs: previewGaps, tapeBtcPerSec: tapeRate, stealthMax, detectedMin });
  const tier = mv.tier;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const makeTicket = () => rfq && setTicket(complianceTicket({ side, qty, mid, sweepAvg: sw.avg, sweepFilled: sw.filled, rfqPrice: rfq.price, rfqBps: rfq.bps, stealth: mv.composite, time: new Date() }));
  const download = (kind: "txt" | "json") => {
    if (!ticket) return;
    const blob = new Blob([kind === "txt" ? ticketText(ticket) : JSON.stringify(ticket, null, 2)], { type: kind === "txt" ? "text/plain" : "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${ticket.id}.${kind}`; a.click(); URL.revokeObjectURL(a.href);
  };
  const sweepCost = sw.avg * sw.filled;
  const rfqCost = rfq ? rfq.price * qty : 0;
  const saved = side === "buy" ? sweepCost - (rfq?.price ?? 0) * sw.filled : (rfq?.price ?? 0) * sw.filled - sweepCost;

  const levelsRef = useRef(levels); levelsRef.current = levels;
  const start = () => {
    clearTimeout(timer.current);
    const seed = Date.now() % 1000;
    const clips = sliceOrder(qty, clip, seed);
    const gaps = sliceIntervals(clips.length, 400, seed + 11);
    setRun({ clips, gaps, done: 0, fills: [] });
    let i = 0;
    const step = () => {
      const px = levelsRef.current[0]?.[0] ?? 0;
      setRun((r) => (r ? { ...r, done: r.done + 1, fills: [...r.fills, px] } : r));
      if (++i < clips.length) timer.current = setTimeout(step, gaps[i]);
    };
    timer.current = setTimeout(step, gaps[0]);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const sliceAvg = run && run.done ? run.fills.reduce((s, p, i) => s + p * run.clips[i]!, 0) / run.clips.slice(0, run.done).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-semibold">FZ/<span className="text-primary">DESK</span></span>
        <span className={cn("text-[11px]", live ? "text-primary" : "text-destructive")}>{live ? "● LIVE" : "○ CONNECTING"}</span>
        <span className="text-[11px] text-muted-foreground">BTCUSDT mid {mid ? usd(mid) : "—"}</span>
        <nav className="ml-auto flex flex-wrap gap-1">
          {(["/", "/bookmap", "/tape", "/icebergs"] as const).map((to, i) => (
            <Button key={to} asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to={to}>{["Terminal", "Bookmap", "Tape", "Iceberg Radar"][i]}</Link></Button>
          ))}
        </nav>
      </header>
      <p className="border-b border-border px-3 py-1 text-[11px] text-muted-foreground">Simulation only — no orders are sent. RFQ quotes are modelled, not real dealer prices.</p>

      <main className="grid gap-3 p-3 lg:grid-cols-3">
        <section className="space-y-3 rounded border border-border bg-card p-3">
          <h2 className="text-sm font-semibold">Parent order</h2>
          <div className="flex gap-2">
            {(["buy", "sell"] as const).map((s) => (
              <Button key={s} size="sm" variant={side === s ? "default" : "outline"} onClick={() => setSide(s)} className="flex-1 uppercase">{s}</Button>
            ))}
          </div>
          <label className="block text-xs text-muted-foreground">Size (BTC)
            <input type="number" min={0.1} step={0.1} value={qty} onChange={(e) => setQty(Math.max(0.1, +e.target.value || 0.1))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-foreground" />
          </label>
          <label className="block text-xs text-muted-foreground">Visible clip (BTC)
            <input type="number" min={0.01} step={0.05} value={clip} onChange={(e) => setClip(Math.max(0.01, +e.target.value || 0.01))} className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-foreground" />
          </label>
          <div className="text-xs">Notional: <b>{usd(notional)}</b></div>
          <div className={cn("rounded border p-2 text-xs", lis ? "border-primary text-primary" : "border-border text-muted-foreground")}>
            Large-in-Scale (illustrative {usd(LIS_NOTIONAL)}): {lis ? "MET — pre-trade transparency waiver eligible" : "NOT MET — order would be shown publicly"}
          </div>
        </section>

        <section className="space-y-2 rounded border border-border bg-card p-3 text-xs">
          <h2 className="text-sm font-semibold">Impact comparison</h2>
          <Row k="A. Sweep visible book" v={sw.filled ? usd(sw.avg) : "—"} sub={`${sw.slipBps.toFixed(1)} bps slip · worst ${usd(sw.worst)}${sw.unfilled > 0 ? ` · ${sw.unfilled.toFixed(2)} BTC beyond top-20 depth` : ""}`} />
          <Row k="B. OTC RFQ (bilateral)" v={rfq ? usd(rfq.price) : "—"} sub={rfq ? `${rfq.bps.toFixed(1)} bps fixed spread · total ${usd(rfqCost)}` : ""} />
          <Row k="C. Iceberg slicer" v={sliceAvg ? usd(sliceAvg) : "press Start"} sub={run ? `${run.done}/${run.clips.length} clips filled` : `${Math.ceil(qty / clip)} clips approx`} />
          <div className={cn("rounded p-2", saved > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            RFQ vs sweep on filled size: {saved > 0 ? `saves ${usd(saved)}` : `costs ${usd(-saved)} more`}
          </div>
          <Button size="sm" className="w-full" onClick={start} disabled={!mid}>Start iceberg slicer</Button>
          <Button size="sm" variant="outline" className="w-full" onClick={makeTicket} disabled={!rfq}>Generate compliance ticket</Button>
        </section>

        <section className="space-y-2 rounded border border-border bg-card p-3 text-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Radar evasion</h2>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", TIER[tier].badge)}>{TIER[tier].label}</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded bg-muted">
            <div className={cn("h-full", TIER[tier].bar)} style={{ width: `${mv.composite}%` }} />
            <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${100 - detectedMin}%` }} />
            <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${100 - stealthMax}%` }} />
          </div>
          <p className="text-muted-foreground">Composite stealth {mv.composite}/100. {TIER[tier].text}</p>
          {([["Top-of-book depth", mv.top, "25%"], ["5-level depth", mv.l5, "25%"], ["Clip-size randomness", mv.entropy, "15%"], [`Tape participation (POV ${mv.pov}%)`, mv.povScore, "20%"], ["Timing jitter", mv.timing, "15%"]] as const).map(([k, v, w]) => (
            <div key={k}>
              <div className="flex justify-between text-muted-foreground"><span>{k} <span className="opacity-60">· weight {w}</span></span><b className="text-foreground">{v}</b></div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${v}%` }} /></div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Single-ratio exposure (clip vs top level): {radar}%.</p>
          <label className="block text-muted-foreground">Stealth limit: clip under {stealthMax}% of book
            <input type="range" min={5} max={detectedMin - 5} value={stealthMax} onChange={(e) => setStealthMax(+e.target.value)} className="w-full accent-primary" />
          </label>
          <label className="block text-muted-foreground">Detected above: {detectedMin}% of book
            <input type="range" min={stealthMax + 5} max={100} value={detectedMin} onChange={(e) => setDetectedMin(+e.target.value)} className="w-full accent-primary" />
          </label>
          <h3 className="pt-2 font-semibold">Child fills</h3>
          <ol className="max-h-64 space-y-0.5 overflow-auto">
            {run?.fills.map((p, i) => (
              <li key={i} className="flex justify-between"><span>#{i + 1} {run.clips[i]!.toFixed(3)} BTC</span><span>{usd(p)}</span></li>
            ))}
            {!run && <li className="text-muted-foreground">No slicer run yet.</li>}
          </ol>
        </section>
      </main>
      {ticket && (
        <section className="mx-3 mb-3 space-y-2 rounded border border-primary bg-card p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Compliance ticket {ticket.id}</h2>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => navigator.clipboard?.writeText(ticketText(ticket))}>Copy</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => download("txt")}>Download .txt</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => download("json")}>Download .json</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setTicket(null)}>Close</Button>
            </div>
          </div>
          <pre className="overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">{ticketText(ticket)}</pre>
        </section>
      )}
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><b>{v}</b></div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
