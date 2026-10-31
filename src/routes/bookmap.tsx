import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Pause, Play, Radio, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketCanvas } from '@/components/bookmap/market-canvas';
import { useBookmap } from '@/hooks/use-bookmap';
import { volumeSince, type MarketData } from '@/lib/bookmap';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/bookmap')({
  head: () => ({ meta: [
    { title: 'Live Spot & Perpetual Bookmap — FZ Quant Terminal' },
    { name: 'description', content: 'Live Binance BTCUSDT Spot and Perpetual depth heatmaps, executed trade bubbles, DOM ladders, session CVD and observed liquidations.' },
    { property: 'og:title', content: 'Live Spot & Perpetual Bookmap — FZ Quant Terminal' },
    { property: 'og:description', content: 'Compare live Spot and Perpetual liquidity with macro depth, executions and session order flow.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: BookmapPage,
});
const money = (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1000).toFixed(1)}K`;
const price = (v: number) => v ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const clock = (t: number) => new Date(t).toISOString().slice(11, 19);

function BookmapPage() {
  const spot = useBookmap('spot'), perps = useBookmap('perps');
  const [frozen, setFrozen] = useState<{ spot: MarketData; perps: MarketData } | null>(null);
  const [tab, setTab] = useState('spot');
  const [scale, setScale] = useState('reference');
  const [minutes, setMinutes] = useState(5);
  const [bubbleMin, setBubbleMin] = useState(0.5);
  const shownSpot = frozen?.spot ?? spot, shownPerps = frozen?.perps ?? perps;
  return <main className="bookmap-shell m-1 flex min-h-screen flex-col bg-background font-mono text-[10px] text-foreground sm:m-2">
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-bookmap-cyan bg-card px-3 py-2">
      <h1 className="font-display text-lg font-semibold">FZ<span className="text-bookmap-cyan">/</span>BOOKMAP</h1>
      <span className="text-muted-foreground">BTCUSDT <span className="text-bookmap-gold">/</span> BINANCE</span>
      <nav className="ml-auto flex flex-wrap gap-1" aria-label="Terminal navigation">
        {([{ to: '/', label: 'Dashboard' }, { to: '/tape', label: 'Tape' }, { to: '/icebergs', label: 'Icebergs' }] as const).map(l => <Button key={l.to} asChild variant="ghost" size="sm" className="h-7 px-2 text-[10px]"><Link to={l.to}>{l.label}</Link></Button>)}
        <Button variant="outline" size="icon" className="size-7" aria-label={frozen ? 'Resume Bookmap' : 'Pause Bookmap'} title={frozen ? 'Resume live view' : 'Pause view (feeds continue)'} onClick={() => setFrozen(frozen ? null : { spot, perps })}>{frozen ? <Play className="size-3" /> : <Pause className="size-3" />}</Button>
        <Button variant="outline" size="icon" className="size-7" aria-label="Toggle fullscreen" title="Fullscreen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => undefined); }}><Maximize2 className="size-3" /></Button>
      </nav>
    </header>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
      <label className="flex items-center gap-2 text-muted-foreground">DEPTH <select aria-label="Bookmap price scale" value={scale} onChange={e => setScale(e.target.value)} className="h-7 max-w-full border border-border bg-card px-1 text-foreground"><option value="reference">Spot macro / Perps micro</option><option value="macro">Both $40k–$100k</option><option value="micro">Both near price</option></select></label>
      <label className="flex items-center gap-2 text-muted-foreground">TIME <select aria-label="Bookmap timeline" value={minutes} onChange={e => setMinutes(+e.target.value)} className="h-7 border border-border bg-card px-1 text-foreground"><option value={1}>1m</option><option value={5}>5m</option><option value={10}>10m</option></select></label>
      <label className="flex items-center gap-2 text-muted-foreground">BUBBLES <select aria-label="Minimum execution bubble size" value={bubbleMin} onChange={e => setBubbleMin(+e.target.value)} className="h-7 border border-border bg-card px-1 text-foreground"><option value={0}>All</option><option value={0.5}>≥ 0.5 BTC</option><option value={1}>≥ 1 BTC</option><option value={5}>≥ 5 BTC</option></select></label>
      <span className="ml-auto text-bookmap-cyan">{frozen ? 'PAUSED VIEW' : 'LIVE CAPTURE'} <span className="text-muted-foreground">· UTC</span></span>
    </div>
    <div className="grid min-w-0 flex-1 gap-1 p-1 xl:grid-cols-[200px_minmax(0,1fr)_155px] 2xl:grid-cols-[240px_minmax(0,1fr)_180px]">
      <aside className="order-2 min-w-0 border border-bookmap-cyan xl:order-1">
        <h2 className="border-b border-bookmap-cyan bg-bookmap-cyan px-3 py-2 font-display text-sm font-semibold text-background">LIQUIDATIONS</h2>
        <div className="flex justify-between border-b border-border p-2 text-muted-foreground"><span>BTCUSDT · PERPS</span><span>UTC</span></div>
        <div className="h-[220px] overflow-y-auto xl:h-[380px]">
          {!shownPerps.liquidations.length && <p className="p-3 text-muted-foreground">No liquidations observed this session.</p>}
          {shownPerps.liquidations.slice(0, 40).map(l => <div key={l.id} className={cn('border-b border-border px-2 py-2', l.side === 'long' ? 'bg-up/10' : 'bg-down/10')}><div className="flex justify-between"><span>BTCUSDT</span><span className={l.side === 'long' ? 'text-up' : 'text-down'}>{money(l.price * l.qty)}</span></div><div className="mt-1 flex justify-between text-[9px] text-muted-foreground"><span>{l.side.toUpperCase()} · {price(l.price)}</span><span>{clock(l.time)}</span></div></div>)}
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-bookmap-gold bg-border">
          {[1, 4, 12, 24].map(hours => {
            const items = shownPerps.liquidations.filter(l => l.time >= shownPerps.tick - hours * 3600_000);
            const long = items.filter(l => l.side === 'long').reduce((s, l) => s + l.price * l.qty, 0), short = items.filter(l => l.side === 'short').reduce((s, l) => s + l.price * l.qty, 0);
            return <div key={hours} className="bg-card p-2"><div className="text-muted-foreground">{hours}h OBSERVED</div><div className="my-2 font-display text-base font-semibold">{money(long + short)}</div><div className="flex justify-between text-up"><span>Long</span>{money(long)}</div><div className="mt-1 flex justify-between text-down"><span>Short</span>{money(short)}</div></div>;
          })}
        </div>
        <p className="p-2 text-[9px] leading-relaxed text-muted-foreground">Sampled Binance BTC liquidations only, not market-wide totals. Windows accumulate from connection.</p>
      </aside>
      <section className="order-1 min-w-0 xl:order-2">
        <div className="mb-1 flex gap-1 lg:hidden">{['spot', 'perps'].map(v => <Button key={v} size="sm" variant={tab === v ? 'default' : 'outline'} aria-pressed={tab === v} onClick={() => setTab(v)} className="h-8 flex-1 uppercase">{v === 'spot' ? 'Spot' : 'Perpetual'}</Button>)}</div>
        <div className="grid min-w-0 gap-1 lg:grid-cols-2">
          {[shownSpot, shownPerps].map(d => <section key={d.market} className={cn('bookmap-panel min-w-0', tab !== d.market && 'hidden lg:block')} aria-label={`${d.market} Bookmap panel`}>
            <div className="flex flex-wrap items-center justify-between gap-y-2 border-b border-bookmap-gold pr-2">
              <h2 className="bookmap-label w-40 px-4 py-1.5 font-display text-base font-semibold">{d.market === 'spot' ? 'S P O T' : 'P E R P S'}</h2>
              <div className="px-2 py-1 text-right"><div className="text-sm font-semibold text-bookmap-cyan" data-testid={`${d.market}-price`}>{price(d.price)}</div><div className={cn('flex items-center justify-end gap-1 uppercase', d.status === 'live' && d.tick - d.lastDepth < 5000 ? 'text-up' : 'text-down')}><Radio className="size-2.5" />{d.status}</div></div>
            </div>
            <div className="h-[640px] 2xl:h-[740px]"><MarketCanvas data={d} macro={scale === 'macro' || (scale === 'reference' && d.market === 'spot')} minutes={minutes} bubbleMin={bubbleMin} /></div>
            <div className="border-t border-border px-2 py-1.5 text-[9px] text-muted-foreground">Snapshot ≤ {d.market === 'spot' ? '5,000' : '1,000'} levels/side · blank depth = unknown{d.frames.length ? ` · ${d.frames.length}s captured` : ''}</div>
          </section>)}
        </div>
      </section>
      <aside className="order-3 min-w-0 border border-bookmap-cyan">
        <h2 className="border-b border-bookmap-cyan px-2 py-2 font-display text-sm font-semibold text-bookmap-cyan">EXECUTED VOLUME</h2>
        <div className="grid grid-cols-[25px_1fr_1fr] gap-px bg-border text-[9px]"><span className="bg-card p-1" /><span className="bg-up/20 p-1 text-center text-up">BUY</span><span className="bg-down/20 p-1 text-center text-down">SELL</span>
          {[5, 30, 240, 1440].map(m => { const a = volumeSince(shownSpot.volumes, shownSpot.tick, m), b = volumeSince(shownPerps.volumes, shownPerps.tick, m); return <div key={m} className="contents"><span className="bg-card px-1 py-2">{m < 60 ? `${m}m` : m === 240 ? '4h' : '1d'}</span><span className="bg-up/20 px-1 py-2 text-center text-up">{money(a.buy + b.buy)}</span><span className="bg-down/20 px-1 py-2 text-center text-down">{money(a.sell + b.sell)}</span></div>; })}
        </div>
        <p className="border-b border-border px-2 py-2 text-[9px] text-muted-foreground">Spot + Perps · session-captured</p>
        <h3 className="border-b border-border px-2 py-2 text-bookmap-gold">BLOCK TAPE ≥ $100K</h3>
        <div className="h-[300px] overflow-y-auto xl:h-[520px]">
          {[...shownSpot.tape.map(t => ({ ...t, market: 'S' })), ...shownPerps.tape.map(t => ({ ...t, market: 'P' }))].sort((a, b) => b.time - a.time).slice(0, 60).map(t => <div key={`${t.market}-${t.id}`} className={cn('border-b border-border px-2 py-1.5', t.side === 'buy' ? 'bg-up/15' : 'bg-down/15')}><div className="flex justify-between gap-1"><span className={t.side === 'buy' ? 'text-up' : 'text-down'}>{t.side === 'buy' ? '▲' : '▼'} {t.price.toFixed(1)}</span><span>{money(t.qty * t.price)}</span></div><div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground"><span>{t.market === 'S' ? 'SPOT' : 'PERPS'} · {t.qty.toFixed(2)} BTC</span><span>{clock(t.time)}</span></div></div>)}
          {!shownSpot.tape.length && !shownPerps.tape.length && <p className="p-2 text-muted-foreground">Waiting for large executions…</p>}
        </div>
      </aside>
    </div>
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-bookmap-cyan px-3 py-2 text-[9px] text-muted-foreground"><span className="flex items-center gap-2">RESTING BTC <span className="bookmap-spectrum h-2 w-24" /> LOW → HIGH</span><span><span className="text-up">● BUY</span> / <span className="text-down">● SELL</span> EXECUTIONS</span><span className="ml-auto">Observed Binance depth only · gaps remain blank · history begins on connection</span></footer>
  </main>;
}
