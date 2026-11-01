import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { icebergIdentity, type AbsorptionSample } from '@/lib/absorption-view';
import { isIceberg, type Iceberg, type IcebergConfig, type Track } from '@/lib/iceberg';

export function AbsorptionMeter({ track, side, cfg, flow }: { track: Track | null; side: 'bid' | 'ask'; cfg: IcebergConfig; flow: number }) {
  const buy = side === 'bid';
  const executed = track?.executed ?? 0, visible = track?.visible ?? 0;
  const hidden = Math.max(0, executed - visible);
  const goal = Math.max(cfg.minBtc, cfg.ratio * visible, executed, 0.01);
  const estimated = track ? isIceberg(track, cfg) : false;
  return <div className="min-w-0 border-t-2 border-border py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={cn('font-semibold', buy ? 'text-up' : 'text-down')}>{buy ? 'BID · BUY ABSORPTION' : 'ASK · SELL ABSORPTION'}</span>
      <span className="tabular-nums text-foreground">{track ? `$${track.price.toFixed(2)}` : '—'}</span>
    </div>
    <div className="mt-2 flex items-end justify-between gap-2">
      <strong className={cn('text-2xl tabular-nums', buy ? 'text-up' : 'text-down')}>{executed.toFixed(3)} <span className="text-xs font-normal">BTC filled</span></strong>
      <span className={cn('text-[10px]', estimated ? 'text-primary' : 'text-muted-foreground')}>{estimated ? 'HIDDEN ESTIMATE' : 'OBSERVED FILLS'}</span>
    </div>
    <svg className="my-2 h-5 w-full" viewBox="0 0 100 5" preserveAspectRatio="none" role="img" aria-label={`${buy ? 'Bid' : 'Ask'} absorption: ${executed.toFixed(3)} BTC filled, ${hidden.toFixed(3)} BTC estimated excess`}>
      <rect width="100" height="5" className="fill-muted" />
      <rect width={Math.min(executed, visible) / goal * 100} height="5" className={buy ? 'fill-up' : 'fill-down'} opacity="0.5" />
      <rect x={Math.min(executed, visible) / goal * 100} width={hidden / goal * 100} height="5" className={buy ? 'fill-up' : 'fill-down'} />
      <line x1={Math.min(100, Math.max(cfg.minBtc, cfg.ratio * visible) / goal * 100)} x2={Math.min(100, Math.max(cfg.minBtc, cfg.ratio * visible) / goal * 100)} y1="0" y2="5" className="stroke-foreground" strokeWidth="0.4" />
    </svg>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
      <span>Visible supply {visible.toFixed(3)}</span><span className="text-right">Excess est. {hidden.toFixed(3)}</span>
      <span>{track?.refills ?? 0} visible reloads</span><span className="text-right">60s {buy ? 'sell' : 'buy'} flow {flow.toFixed(2)} BTC</span>
    </div>
  </div>;
}

export function AbsorptionChart({ samples, levels, live }: { samples: AbsorptionSample[]; levels: Iceberg[]; live: boolean }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [minutes, setMinutes] = useState(1);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !size.width || !size.height) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size.width * dpr; el.height = size.height * dpr; ctx.scale(dpr, dpr);
    const styles = getComputedStyle(el), color = (name: string) => styles.getPropertyValue(name).trim();
    const w = size.width, h = size.height, left = 10, right = w - 86, top = 22, bottom = h - 66;
    ctx.fillStyle = color('--background'); ctx.fillRect(0, 0, w, h);
    ctx.font = "10px 'JetBrains Mono', monospace";
    const end = samples.at(-1)?.time ?? Date.now(), start = end - minutes * 60_000;
    const visible = samples.filter(s => s.time >= start);
    const current = visible.at(-1);
    if (!current) {
      ctx.fillStyle = color('--muted-foreground'); ctx.textAlign = 'center';
      ctx.fillText(live ? 'Waiting for observed trades…' : 'Connecting to Binance…', w / 2, h / 2);
      return;
    }
    const relevant = levels.filter(i => i.last >= start).slice(0, 30);
    const prices = [...visible.map(s => s.price), ...relevant.map(i => i.price)];
    const low = Math.min(...prices), high = Math.max(...prices), pad = Math.max(2, (high - low) * 0.2);
    const min = low - pad, max = high + pad;
    const x = (t: number) => left + (t - start) / (end - start) * (right - left);
    const y = (p: number) => top + (max - p) / (max - min) * (bottom - top);
    ctx.strokeStyle = color('--border'); ctx.fillStyle = color('--muted-foreground'); ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const p = min + (max - min) * i / 4, yy = y(p);
      ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
      if (Math.abs(yy - y(current.price)) > 14) ctx.fillText(p.toFixed(2), right + 6, yy + 3);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    for (const i of relevant) {
      ctx.strokeStyle = color(i.side === 'bid' ? '--up' : '--down');
      ctx.globalAlpha = i.outcome === 'holding' ? 0.9 : 0.4;
      ctx.lineWidth = Math.min(7, 1.5 + Math.sqrt(i.executed) / 2);
      ctx.setLineDash(i.outcome === 'broken' ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(x(Math.max(start, i.start)), y(i.price));
      ctx.lineTo(x(i.outcome === 'holding' ? end : i.last), y(i.price)); ctx.stroke();
      if (i.outcome === 'broken') {
        const xx = x(i.last), yy = y(i.price);
        ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath();
        ctx.moveTo(xx - 4, yy - 4); ctx.lineTo(xx + 4, yy + 4); ctx.moveTo(xx + 4, yy - 4); ctx.lineTo(xx - 4, yy + 4); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.strokeStyle = color('--foreground');
    ctx.beginPath(); let previous = 0;
    for (const s of visible) {
      if (!previous || s.time - previous > 1500) ctx.moveTo(x(s.time), y(s.price)); else ctx.lineTo(x(s.time), y(s.price));
      previous = s.time;
    }
    ctx.stroke();
    for (const s of visible) {
      if (!(s.buy + s.sell)) continue;
      ctx.fillStyle = color(s.buy >= s.sell ? '--up' : '--down'); ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.arc(x(s.time), y(s.price), Math.min(8, 1.5 + Math.sqrt(s.buy + s.sell) * 2), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.restore();
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = color('--bookmap-cyan');
    ctx.beginPath(); ctx.moveTo(left, y(current.price)); ctx.lineTo(right, y(current.price)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = color('--bookmap-cyan'); ctx.fillRect(right, y(current.price) - 10, 84, 20);
    ctx.fillStyle = color('--background'); ctx.fillText(current.price.toFixed(2), right + 6, y(current.price) + 3);
    const peak = Math.max(0.01, ...visible.map(s => s.buy + s.sell));
    for (const s of visible) {
      const xx = x(s.time), bh = s.buy / peak * 26, sh = s.sell / peak * 26;
      ctx.fillStyle = color('--up'); ctx.fillRect(xx - 1, h - 22 - bh, 1.5, bh);
      ctx.fillStyle = color('--down'); ctx.fillRect(xx + 1, h - 22 - sh, 1.5, sh);
    }
    ctx.fillStyle = color('--muted-foreground');
    for (let i = 0; i <= 2; i++) {
      ctx.textAlign = i === 0 ? 'left' : i === 2 ? 'right' : 'center';
      ctx.fillText(new Date(start + (end - start) * i / 2).toISOString().slice(11, 19), left + (right - left) * i / 2, h - 6);
    }
  }, [samples, levels, minutes, size, live]);

  const active = levels.filter(i => i.outcome === 'holding');
  return <section className="min-w-0 border-y border-border">
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <h2 className="text-[11px] font-semibold tracking-widest">LIVE ABSORPTION LEVELS</h2>
      <div className="flex gap-1" aria-label="Chart time window">
        {[1, 5].map(m => <Button key={m} size="sm" variant={minutes === m ? 'default' : 'outline'} className="h-6 px-2 text-[10px]" aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m}m</Button>)}
      </div>
    </div>
    <div ref={host} className="relative h-[340px] min-w-0 sm:h-[420px]">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="Live BTCUSDT price, executed flow and horizontal estimated hidden absorption levels" />
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-1 py-2 text-[10px] text-muted-foreground">
      <span className="text-up">━ Bid absorption</span><span className="text-down">━ Ask absorption</span><span>┄ × Broken level</span><span>● Executed flow</span><span className="ml-auto">UTC · SESSION ONLY</span>
    </div>
    {active.length > 0 && <div className="flex flex-wrap gap-3 border-t border-border py-2">{active.map(i => <span key={icebergIdentity(i)} className={cn('text-[10px] tabular-nums', i.side === 'bid' ? 'text-up' : 'text-down')}>{i.side.toUpperCase()} ${i.price.toFixed(2)} · {i.executed.toFixed(2)} BTC · EST.</span>)}</div>}
  </section>;
}