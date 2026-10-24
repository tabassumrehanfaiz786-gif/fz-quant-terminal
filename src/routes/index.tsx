import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTerminal, type Interval } from "@/hooks/use-terminal";
import { PriceChart, EquityChart } from "@/components/terminal/charts";
import { stats, unrealized, nearestLevel, type EngineState, type Mode } from "@/lib/strategy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useOrderBook } from "@/hooks/use-order-book";
import { LiquidityHeatmap } from "@/components/terminal/liquidity-heatmap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FZ Quant Terminal — BTCUSDT Paper Trading" },
      { name: "description", content: "Live BTCUSDT emerald order book liquidity heatmap, large passive order walls, and automated paper trading with Binance market data." },
      { property: "og:title", content: "FZ Quant Terminal — BTCUSDT Paper Trading" },
      { property: "og:description", content: "Live emerald Binance liquidity heatmap with red resting order walls, BTC price, and paper trading analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Terminal,
});

const usd = (n: number, d = 2) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted-foreground");
const ts = (t: number) => new Date(t * 1000).toISOString().slice(5, 19).replace("T", " ");

function Panel({ title, children, className, right }: { title: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col border border-border bg-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{title}</span>{right}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Terminal() {
  const [interval, setInterval] = useState<Interval>("1m");
  const [mode, setMode] = useState<Mode>("sweep");
  const [view, setView] = useState("liquidity");
  const depth = useOrderBook();
  const { candles, engines, feed } = useTerminal(interval);
  const e = engines[mode];
  const price = candles[candles.length - 1]?.close ?? 0;
  const st = stats(e);
  const upnl = unrealized(e, price);
  const equity = e.balance + upnl;
  const p = e.position;

  return (
    <div className="flex min-h-screen flex-col gap-2 bg-background p-2 font-mono text-xs text-foreground lg:h-screen lg:min-h-[920px]">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-border bg-card px-3 py-2">
        <div className="font-display text-base font-semibold tracking-tight">FZ<span className="text-primary">/</span>Quant Terminal</div>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", feed === "live" ? "bg-up animate-pulse" : feed === "down" ? "bg-down" : "bg-primary")} />
          <span className="text-muted-foreground">BINANCE · BTCUSDT · {feed.toUpperCase()}</span>
        </div>
        <div className="text-lg font-semibold tabular-nums">{price ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}</div>
        <div className="text-muted-foreground">Nearest level <span className="text-primary">{price ? `${nearestLevel(price) / 1000}k` : "—"}</span> ({price ? usd(price - nearestLevel(price), 0) : "—"})</div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <Seg value={interval} onChange={(v) => setInterval(v as Interval)} options={[["1m", "1m"], ["5m", "5m"], ["15m", "15m"]]} />
          <Seg value={mode} onChange={(v) => setMode(v as Mode)} options={[["sweep", "Institutional Sweep & Reclaim"], ["touch", "Basic 10k Touch"]]} />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Equity" value={usd(equity)} />
        <Stat label="Balance" value={usd(e.balance)} />
        <Stat label="Unrealized" value={usd(upnl)} cls={tone(upnl)} />
        <Stat label="Realized" value={usd(st.realized)} cls={tone(st.realized)} />
        <Stat label="Win rate" value={`${st.winRate.toFixed(1)}%`} sub={`${st.wins}/${st.trades} trades`} />
        <Stat label="Position size" value="$50,000" sub="stop cap $2,500" />
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-h-[660px] min-w-0 gap-2 grid-rows-[minmax(460px,1fr)_170px]">
          <Panel title={view === "liquidity" ? "Liquidity · Binance depth" : `Chart · ${interval}`} right={<Seg value={view} onChange={setView} options={[["liquidity", "Heatmap"], ["candles", "Candles"]]} />}>
            <div className={cn("h-full", view !== "liquidity" && "hidden")}><LiquidityHeatmap data={depth} /></div>
            {view === "candles" && <PriceChart key={`${interval}-${mode}`} candles={candles} engine={e} />}
          </Panel>
          <Panel title="Equity curve"><EquityChart key={`${interval}-${mode}`} engine={e} /></Panel>
        </div>
        <div className="grid min-h-0 gap-2 lg:grid-rows-[auto_auto_1fr]">
          <Panel title="Open position">
            {p ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3">
                <Row k="Side" v={<span className={p.side === "long" ? "text-up" : "text-down"}>{p.side.toUpperCase()} @ {p.level / 1000}k</span>} />
                <Row k="Entry" v={p.entry.toFixed(1)} />
                <Row k="Qty" v={`${p.qty.toFixed(4)} BTC`} />
                <Row k="Stop" v={`${p.stop.toFixed(1)}${p.beMoved ? " (BE)" : ""}`} />
                <Row k="TP1" v={`${p.tp1.toFixed(0)}${p.tp1Hit ? " ✓" : ""}`} />
                <Row k="Runner" v={p.target.toLocaleString()} />
                <Row k="uPnL" v={<span className={tone(upnl)}>{usd(upnl)}</span>} />
                <Row k="Booked" v={<span className={tone(p.realized)}>{usd(p.realized)}</span>} />
              </div>
            ) : <p className="p-3 text-muted-foreground">Flat — waiting for a 10k setup. No re-entry while a position is open.</p>}
          </Panel>
          <Panel title="Mode comparison">
            <table className="w-full text-left">
              <thead className="text-muted-foreground"><tr><th className="px-3 py-1 font-normal">Mode</th><th>Trades</th><th>Win%</th><th className="pr-3 text-right">PnL</th></tr></thead>
              <tbody>{(["sweep", "touch"] as Mode[]).map((m) => <CmpRow key={m} e={engines[m]} price={price} active={m === mode} />)}</tbody>
            </table>
          </Panel>
          <Panel title="Risk & compliance audit log" className="min-h-[260px]">
            <ul className="h-full overflow-y-auto p-2">
              {[...e.audit].reverse().map((a, i) => (
                <li key={i} className="flex gap-2 border-b border-border/50 py-1">
                  <span className="shrink-0 text-muted-foreground">{ts(a.time)}</span>
                  <span className={cn("w-14 shrink-0", { ENTRY: "text-accent-foreground", EXIT: "text-primary", PARTIAL: "text-up", RISK: "text-primary", REJECT: "text-down", REARM: "text-muted-foreground", SYSTEM: "text-muted-foreground" }[a.kind])}>{a.kind}</span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title={`Trade history (${e.trades.length})`} className="max-h-48">
        <div className="h-full overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-card text-muted-foreground"><tr>{["Exit time", "Side", "Level", "Entry", "Exit", "Reason", "PnL"].map((h) => <th key={h} className="px-3 py-1 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {[...e.trades].reverse().map((t) => (
                <tr key={t.id} className="border-t border-border/50">
                  <td className="px-3 py-1">{ts(t.exitTime)}</td>
                  <td className={cn("px-3", t.side === "long" ? "text-up" : "text-down")}>{t.side.toUpperCase()}</td>
                  <td className="px-3">{t.level / 1000}k</td><td className="px-3">{t.entry.toFixed(1)}</td><td className="px-3">{t.exit.toFixed(1)}</td>
                  <td className="px-3">{t.reason}</td><td className={cn("px-3", tone(t.pnl))}>{usd(t.pnl)}</td>
                </tr>
              ))}
              {!e.trades.length && <tr><td className="px-3 py-2 text-muted-foreground" colSpan={7}>No closed trades yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex max-w-full flex-wrap border border-border">
      {options.map(([v, l]) => (
        <Button key={v} size="sm" variant="ghost" aria-pressed={value === v} onClick={() => onChange(v)} className={cn("h-auto rounded-none px-2.5 py-1 text-[11px]", value === v ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground hover:text-foreground")}>{l}</Button>
      ))}
    </div>
  );
}
function Stat({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold tabular-nums", cls)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (<><span className="text-muted-foreground">{k}</span><span className="text-right tabular-nums">{v}</span></>);
function CmpRow({ e, price, active }: { e: EngineState; price: number; active: boolean }) {
  const s = stats(e);
  const total = e.balance + unrealized(e, price) - e.cfg.startBalance;
  return (
    <tr className={cn("border-t border-border/50", active && "bg-secondary")}>
      <td className="px-3 py-1">{e.mode === "sweep" ? "Sweep & Reclaim" : "10k Touch"}</td><td>{s.trades}</td><td>{s.winRate.toFixed(0)}%</td>
      <td className={cn("pr-3 text-right", tone(total))}>{usd(total, 0)}</td>
    </tr>
  );
}
