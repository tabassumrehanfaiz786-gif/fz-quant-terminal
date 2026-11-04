import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { arbEdge, basisBps, leadLag } from "@/lib/leadlag";

export const Route = createFileRoute("/leadlag")({
  head: () => ({
    meta: [
      { title: "Cross-Market Lead-Lag Radar — FZ Quant Terminal" },
      { name: "description", content: "Live BTC price discovery across Binance Spot, Binance Perpetual and Coinbase: basis, lead-lag and simulated latency arbitrage." },
      { property: "og:title", content: "Cross-Market Lead-Lag Radar — FZ Quant Terminal" },
      { property: "og:description", content: "Which venue moves first? Live basis, lead-lag and consolidated-tape view of BTC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadLagPage,
});

type V = "spot" | "perp" | "cb";
const NAMES: Record<V, string> = { spot: "Binance Spot", perp: "Binance Perp", cb: "Coinbase" };
const STEP = 100, KEEP = 600, MAXLAG = 10; // 100ms samples, 60s window, ±1s lag scan

function useFeeds() {
  const px = useRef<Record<V, number>>({ spot: 0, perp: 0, cb: 0 });
  const [hist, setHist] = useState<Record<V, number[]>>({ spot: [], perp: [], cb: [] });
  const [live, setLive] = useState<Record<V, boolean>>({ spot: false, perp: false, cb: false });
  useEffect(() => {
    let stop = false;
    const socks: WebSocket[] = [];
    const open = (v: V, url: string, onOpen: (w: WebSocket) => void, parse: (d: any) => number | null) => {
      const go = () => {
        const w = new WebSocket(url); socks.push(w);
        w.onopen = () => { setLive((l) => ({ ...l, [v]: true })); onOpen(w); };
        w.onmessage = (e) => { const p = parse(JSON.parse(e.data)); if (p) px.current[v] = p; };
        w.onclose = () => { setLive((l) => ({ ...l, [v]: false })); if (!stop) setTimeout(go, 2000); };
      };
      go();
    };
    const bt = (d: any) => (d.b && d.a ? (+d.b + +d.a) / 2 : null);
    open("spot", "wss://data-stream.binance.vision/ws/btcusdt@bookTicker", () => {}, bt);
    open("perp", "wss://fstream.binance.com/ws/btcusdt@bookTicker", () => {}, bt);
    open("cb", "wss://ws-feed.exchange.coinbase.com", (w) => w.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] })),
      (d) => (d.type === "ticker" && d.best_bid ? (+d.best_bid + +d.best_ask) / 2 : null));
    const t = setInterval(() => {
      const p = px.current;
      if (!p.spot || !p.perp || !p.cb) return;
      setHist((h) => ({ spot: [...h.spot, p.spot].slice(-KEEP), perp: [...h.perp, p.perp].slice(-KEEP), cb: [...h.cb, p.cb].slice(-KEEP) }));
    }, STEP);
    return () => { stop = true; clearInterval(t); socks.forEach((s) => s.close()); };
  }, []);
  return { hist, live };
}

const PAIRS: [V, V][] = [["perp", "spot"], ["cb", "spot"], ["perp", "cb"]];

function LeadLagPage() {
  const { hist, live } = useFeeds();
  const [fee, setFee] = useState(7.5);
  const last = (v: V) => hist[v].at(-1) ?? 0;
  const ready = hist.spot.length > 30;

  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Cross-Market Lead-Lag Radar</h1>
          <p className="text-xs text-muted-foreground">Which venue discovers the BTC price first — live, observed in your browser (~50–200ms network delay, not co-located).</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/">Terminal</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/desk">OTC Desk</Link></Button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        {(Object.keys(NAMES) as V[]).map((v) => (
          <div key={v} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {NAMES[v]}<span className={cn("h-2 w-2 rounded-full", live[v] ? "bg-primary" : "bg-destructive")} />
            </div>
            <div className="font-mono text-2xl">{last(v) ? last(v).toFixed(2) : "—"}</div>
            <div className="text-[11px] text-muted-foreground">{v === "cb" ? "BTC-USD" : "BTC-USDT"} mid</div>
          </div>
        ))}
      </section>

      <section className="mb-4 rounded-lg border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Pair radar (last 60s)</h2>
          <label className="flex items-center gap-2 text-xs">Taker fee per leg (bps)
            <input type="number" min={0} step={0.5} value={fee} onChange={(e) => setFee(Math.max(0, +e.target.value))} className="w-16 rounded border bg-background px-1 py-0.5" />
          </label>
        </div>
        {!ready ? <p className="text-xs text-muted-foreground">Collecting samples from all three venues…</p> : (
          <div className="grid gap-3 md:grid-cols-3">
            {PAIRS.map(([a, b]) => {
              const gap = basisBps(last(a), last(b));
              const ll = leadLag(hist[a], hist[b], MAXLAG);
              const edge = arbEdge(gap, fee);
              const leader = ll.corr < 0.05 ? "No clear leader" : ll.lag > 0 ? `${NAMES[a]} leads by ~${ll.lag * STEP}ms` : ll.lag < 0 ? `${NAMES[b]} leads by ~${-ll.lag * STEP}ms` : "Moving together";
              return (
                <div key={a + b} className="rounded border p-3 text-xs">
                  <div className="mb-1 font-medium">{NAMES[a]} vs {NAMES[b]}</div>
                  <div>Gap: <span className="font-mono">{gap.toFixed(2)} bps</span></div>
                  <div>{leader} <span className="text-muted-foreground">(corr {ll.corr.toFixed(2)})</span></div>
                  <div className={cn("mt-2 rounded px-2 py-1", edge.open ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                    {edge.open ? `Paper arb window: +${edge.net.toFixed(2)} bps after fees` : `No arb: ${edge.net.toFixed(2)} bps after fees`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Coinbase quotes USD while Binance quotes USDT, so part of that gap is the USDT/USD rate, not a mispricing. Simulation only — no orders are sent.</p>
      </section>

      <section className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Why regulators care</h2>
        Fragmented venues mean each one shows a slightly stale price. Fast firms that see the leading venue first can trade against slower resting orders on the lagging one (latency arbitrage). This is the problem the UK consolidated tape (FSMA 2023 / FCA CTP regime) and MiFIR transparency rules try to reduce, and why large orders seek LIS waivers off-book.
      </section>
    </main>
  );
}
