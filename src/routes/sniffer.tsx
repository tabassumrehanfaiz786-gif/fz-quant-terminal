import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { openMatches } from "@/lib/coinbase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sniff, SNIFFER_WEIGHTS, type ParentEstimate, type Print, type SnifferVectors } from "@/lib/sniffer";

export const Route = createFileRoute("/sniffer")({
  head: () => ({
    meta: [
      { title: "5-Vector Hidden Order Sniffer — FZ Quant Terminal" },
      { name: "description", content: "Live counter-surveillance on Binance BTCUSDT prints: detects sliced parent orders by size, timing, participation, persistence and price-walk footprints." },
      { property: "og:title", content: "5-Vector Hidden Order Sniffer — FZ Quant Terminal" },
      { property: "og:description", content: "Reconstructs disguised institutional parent orders from public trade prints." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SnifferPage,
});

const LABELS: Record<keyof SnifferVectors, string> = {
  size: "Clip-size clustering", timing: "Timing regularity", pov: "Participation band", persistence: "Persistence", price: "Price walk",
};
const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`;

function SnifferPage() {
  const prints = useRef<Print[]>([]);
  const [found, setFound] = useState<ParentEstimate[]>([]);
  const [live, setLive] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let stop = false, ws: WebSocket | undefined;
    const go = () => {
      ws = openMatches(m => {
        prints.current.push({ time: m.time, price: m.price, qty: m.qty, side: m.side });
        if (prints.current.length > 20_000) prints.current.splice(0, 5_000);
      }, () => setLive(true), () => { setLive(false); if (!stop) setTimeout(go, 2000); });
    };
    go();
    const t = setInterval(() => {
      const now = Date.now();
      prints.current = prints.current.filter(p => p.time >= now - 120_000);
      setCount(prints.current.length);
      setFound(sniff(prints.current, now));
    }, 1000);
    return () => { stop = true; clearInterval(t); ws?.close(); };
  }, []);

  return (
    <main className="min-h-screen bg-background p-4 font-mono text-xs text-foreground">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold">5-Vector Hidden Order Sniffer</h1>
          <p className="text-muted-foreground">Blue-team counter-surveillance on live Binance BTCUSDT prints · last 120s · {count} prints · <span className={live ? "text-up" : "text-down"}>{live ? "LIVE" : "connecting"}</span></p>
        </div>
        <div className="flex gap-1">
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/">Terminal</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/desk">OTC Desk (red team)</Link></Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]"><Link to="/icebergs">Icebergs</Link></Button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        {(["buy", "sell"] as const).map(side => {
          const f = found.find(x => x.side === side);
          return (
            <section key={side} className="border border-border bg-card p-3" aria-label={`${side} parent order`}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className={cn("font-display text-base font-semibold", side === "buy" ? "text-up" : "text-down")}>{side === "buy" ? "Hidden BUY parent" : "Hidden SELL parent"}</h2>
                {f && <span className={cn("px-2 py-0.5 uppercase", f.tier === "likely" ? "bg-down/20 text-down" : f.tier === "suspect" ? "bg-bookmap-gold/20 text-bookmap-gold" : "bg-muted text-muted-foreground")}>{f.tier} · {f.score}/100</span>}
              </div>
              {!f ? <p className="text-muted-foreground">No cluster of 6+ similar-sized clips yet.</p> : <>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <Stat k="Executed so far" v={`${f.filledBtc.toFixed(2)} BTC`} />
                  <Stat k="Notional" v={money(f.notional)} />
                  <Stat k="Child clips" v={`${f.clips} × ~${f.avgClip.toFixed(3)}`} />
                  <Stat k="VWAP" v={f.vwap.toFixed(1)} />
                  <Stat k="Rate" v={`${f.ratePerMin.toFixed(2)} BTC/min`} />
                  <Stat k="Share of side" v={`${f.povPct.toFixed(1)}%`} />
                </div>
                {(Object.keys(SNIFFER_WEIGHTS) as (keyof SnifferVectors)[]).map(k => (
                  <div key={k} className="mb-1.5">
                    <div className="flex justify-between"><span>{LABELS[k]} <span className="text-muted-foreground">({SNIFFER_WEIGHTS[k] * 100}%)</span></span><span>{Math.round(f.vectors[k])}</span></div>
                    <div className="h-1.5 bg-muted"><div className="h-full bg-bookmap-cyan" style={{ width: `${f.vectors[k]}%` }} /></div>
                  </div>
                ))}
              </>}
            </section>
          );
        })}
      </div>

      <section className="mt-3 border border-border bg-card p-3 leading-relaxed text-muted-foreground">
        <h2 className="mb-1 font-semibold text-foreground">How it breaks the 5 stealth vectors</h2>
        <p>Small clips hide from the book, but repeated similar sizes (size), metronome-like gaps unlike random Poisson arrivals (timing), a steady capped share of volume (participation), presence across the whole window (persistence) and a one-way price walk (price) together leave a footprint. Executed size is observed; the parent's remaining size is unknown.</p>
        <p className="mt-1">Regulatory link: UK MAR Art. 12 and Art. 16 require venues to surveil order patterns. These are statistical estimates from public data, not identification of any participant, and not evidence of manipulation.</p>
      </section>
    </main>
  );
}

const Stat = ({ k, v }: { k: string; v: string }) => <div className="border border-border p-1.5"><div className="text-[9px] text-muted-foreground">{k}</div><div className="font-semibold">{v}</div></div>;
