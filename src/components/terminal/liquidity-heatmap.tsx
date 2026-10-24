import { useEffect, useRef, useState } from "react";
import { Pause, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BIN_SIZE, SAMPLE_MS, type HeatFrame } from "@/lib/order-book";
import type { useOrderBook } from "@/hooks/use-order-book";
import { cn } from "@/lib/utils";

type DepthData = ReturnType<typeof useOrderBook>;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const notional = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}m` : `$${(n / 1000).toFixed(0)}k`;
const clock = (t: number) => new Date(t).toISOString().slice(11, 19);

export function LiquidityHeatmap({ data }: { data: DepthData }) {
  const [range, setRange] = useState(250);
  const [minutes, setMinutes] = useState(5);
  const [threshold, setThreshold] = useState(500_000);
  const [frozen, setFrozen] = useState<HeatFrame[] | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frames = frozen ?? data.frames;
  const last = frames[frames.length - 1];
  const walls = (last?.walls ?? []).filter(l => l.qty * l.price >= threshold);
  const isLive = data.feed === "live" && Date.now() - data.lastUpdate < 5000;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || size.width < 1 || size.height < 1) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size.width * dpr; el.height = size.height * dpr;
    ctx.scale(dpr, dpr);
    const style = getComputedStyle(el);
    const color = (name: string) => style.getPropertyValue(name).trim();
    const colors = Array.from({ length: 7 }, (_, i) => color(`--heat-${i + 1}`));
    const width = size.width, height = size.height, left = 10, right = width < 500 ? 78 : 112, top = 14, bottom = 28;
    const plotW = width - left - right, plotH = height - top - bottom;
    ctx.fillStyle = color("--heat-background"); ctx.fillRect(0, 0, width, height);
    ctx.font = "10px 'JetBrains Mono', monospace";
    const center = Math.round((last?.price ?? data.price) / 50) * 50;
    if (!center || !last) {
      ctx.fillStyle = color("--muted-foreground"); ctx.textAlign = "center";
      ctx.fillText(data.feed === "reconnecting" ? "Depth unavailable · retrying Binance…" : "Synchronizing Binance resting liquidity…", width / 2, height / 2);
      return;
    }
    const end = frozen ? last.time : Date.now(), start = end - minutes * 60_000;
    const x = (time: number) => left + (time - start) / (end - start) * plotW;
    const y = (price: number) => top + (center + range - price) / (range * 2) * plotH;
    const visible = frames.filter(f => f.time >= start && f.time <= end);
    const cellW = SAMPLE_MS / (end - start) * plotW;
    const cellH = BIN_SIZE / (2 * range) * plotH;
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, plotW, plotH); ctx.clip();
    for (const frame of visible) {
      for (const [price, value] of frame.bins) {
        if (price < center - range - BIN_SIZE || price > center + range) continue;
        const intensity = Math.max(0, Math.min(6, Math.floor(Math.log10(Math.max(1, value) / 1000) * 1.6)));
        ctx.fillStyle = colors[intensity] ?? colors[0] ?? color("--liquidity");
        ctx.fillRect(x(frame.time) - cellW, y(price + BIN_SIZE), Math.max(1, cellW + 0.3), Math.max(1, cellH + 0.2));
      }
    }
    ctx.strokeStyle = color("--border"); ctx.globalAlpha = 0.5; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 8; i++) { const yy = top + plotH * i / 8; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(left + plotW, yy); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Historical wall segments end as soon as displayed liquidity disappears.
    ctx.strokeStyle = color("--wall"); ctx.lineWidth = 1.5;
    for (const frame of visible) {
      for (const wall of frame.walls) {
        if (wall.price * wall.qty < threshold || Math.abs(wall.price - center) > range) continue;
        ctx.beginPath(); ctx.moveTo(x(frame.time) - cellW, y(wall.price)); ctx.lineTo(x(frame.time), y(wall.price)); ctx.stroke();
      }
    }
    // The latest observed large resting levels extend across the price ladder.
    ctx.setLineDash([5, 5]); ctx.globalAlpha = 0.6;
    for (const wall of walls) {
      if (Math.abs(wall.price - center) > range) continue;
      ctx.beginPath(); ctx.moveTo(left, y(wall.price)); ctx.lineTo(left + plotW, y(wall.price)); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.strokeStyle = color("--foreground"); ctx.lineWidth = 1.6; ctx.beginPath();
    let prev: HeatFrame | undefined;
    for (const frame of visible) {
      if (!prev || frame.time - prev.time > 1500) ctx.moveTo(x(frame.time), y(frame.price));
      else ctx.lineTo(x(frame.time), y(frame.price));
      prev = frame;
    }
    ctx.stroke();
    ctx.setLineDash([2, 4]); ctx.strokeStyle = color("--liquidity");
    ctx.beginPath(); ctx.moveTo(left, y(last.price)); ctx.lineTo(left + plotW, y(last.price)); ctx.stroke(); ctx.setLineDash([]);
    const point = pointer.current;
    if (point && point.x >= left && point.x <= left + plotW && point.y >= top && point.y <= top + plotH) {
      ctx.strokeStyle = color("--muted-foreground"); ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(point.x, top); ctx.lineTo(point.x, top + plotH); ctx.moveTo(left, point.y); ctx.lineTo(left + plotW, point.y); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.textAlign = "left"; ctx.fillStyle = color("--muted-foreground");
    for (let i = 0; i <= 8; i++) ctx.fillText(money(center + range - i * range / 4), left + plotW + 8, top + i * plotH / 8 + 3);
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) ctx.fillText(clock(start + i * (end - start) / 4), Math.max(30, Math.min(left + plotW - 22, left + i * plotW / 4)), height - 8);
    const py = y(last.price);
    ctx.fillStyle = color("--liquidity"); ctx.fillRect(left + plotW, py - 10, right, 20);
    ctx.fillStyle = color("--heat-background"); ctx.textAlign = "left"; ctx.fillText(money(last.price), left + plotW + 7, py + 3);
    // Label only well-separated wall levels, keeping the live price legible.
    const labelYs: number[] = [py];
    for (const wall of walls) {
      const yy = y(wall.price);
      if (yy < top + 8 || yy > top + plotH - 8 || labelYs.some(v => Math.abs(v - yy) < 23)) continue;
      labelYs.push(yy); ctx.fillStyle = color("--wall");
      ctx.fillText(`${wall.side === "bid" ? "B" : "A"} ${money(wall.price)}`, left + plotW + 7, yy + 3);
    }
    if (point && point.x >= left && point.x <= left + plotW && point.y >= top && point.y <= top + plotH) {
      const at = start + (point.x - left) / plotW * (end - start);
      const p = center + range - (point.y - top) / plotH * range * 2;
      const frame = visible.find(f => Math.abs(f.time - at) <= SAMPLE_MS);
      const value = frame?.bins.get(Math.floor(p / BIN_SIZE) * BIN_SIZE) ?? 0;
      const label = `${clock(at)} UTC · ${money(p)} · ${frame ? notional(value) : "No sample"}`;
      ctx.font = "10px 'JetBrains Mono', monospace";
      const boxW = Math.min(width - 12, ctx.measureText(label).width + 18);
      ctx.fillStyle = color("--card"); ctx.fillRect(6, 6, boxW, 26);
      ctx.fillStyle = color("--foreground"); ctx.fillText(label, 14, 23);
    }
  }, [data, frames, frozen, last, minutes, range, threshold, size, walls]);

  return (
    <div className="flex h-full min-h-[460px] flex-col">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border px-3 py-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground"><Radio className={cn("size-3", isLive ? "text-liquidity" : "text-wall")} /> BTCUSDT · SPOT <span className={isLive ? "text-liquidity" : "text-wall"}>{data.feed}</span></div>
          <div className="mt-1 font-display text-3xl font-semibold tabular-nums text-liquidity">{data.price ? `$${money(data.price)}` : "—"}<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">USDT</span></div>
        </div>
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">PRICE RANGE
          <select aria-label="Heatmap price range" value={range} onChange={e => setRange(Number(e.target.value))} className="h-8 border border-border bg-background px-2 text-xs text-foreground"><option value={100}>± $100</option><option value={250}>± $250</option><option value={500}>± $500</option><option value={1000}>± $1,000</option></select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">TIMELINE
          <select aria-label="Heatmap timeline" value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="h-8 border border-border bg-background px-2 text-xs text-foreground"><option value={1}>1 minute</option><option value={5}>5 minutes</option></select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">WALL ≥ USDT
          <select aria-label="Large resting order threshold" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="h-8 border border-border bg-background px-2 text-xs text-foreground"><option value={100000}>$100k</option><option value={500000}>$500k</option><option value={1000000}>$1m</option><option value={5000000}>$5m</option></select>
        </label>
        <Button variant="outline" size="icon" title={frozen ? "Resume live timeline" : "Pause timeline"} aria-label={frozen ? "Resume live timeline" : "Pause timeline"} onClick={() => setFrozen(frozen ? null : [...data.frames])}>{frozen ? <Play /> : <Pause />}</Button>
      </div>
      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_180px]">
        <div ref={host} className="relative min-h-[320px] min-w-0">
          <canvas ref={canvas} aria-label="Live Binance emerald resting liquidity heatmap with red passive order walls" className="absolute inset-0 h-full w-full cursor-crosshair" onPointerMove={ev => { const rect = ev.currentTarget.getBoundingClientRect(); pointer.current = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }; setSize(s => ({ ...s })); }} onPointerLeave={() => { pointer.current = null; setSize(s => ({ ...s })); }} />
          {!frozen && !isLive && last && <div className="absolute bottom-10 left-3 bg-card px-2 py-1 text-wall">STALE DEPTH · RECONNECTING</div>}
          {frozen && <div className="absolute bottom-10 left-3 bg-card px-2 py-1 text-muted-foreground">PAUSED · {last ? clock(last.time) : "—"} UTC</div>}
        </div>
        <aside className="hidden min-h-0 overflow-y-auto border-l border-border xl:block">
          <div className="border-b border-border px-3 py-2 text-[10px] uppercase text-muted-foreground">Resting walls <span className="text-wall">{walls.length}</span></div>
          {walls.slice(0, 12).map(l => <div key={`${l.side}-${l.price}`} className="border-b border-border/50 px-3 py-2"><div className="flex justify-between"><span className="text-wall">{money(l.price)}</span><span className="text-[10px] text-muted-foreground">{l.side.toUpperCase()}</span></div><div className="mt-1 flex justify-between text-[10px]"><span className="text-foreground">{notional(l.price * l.qty)}</span><span className="text-muted-foreground">{l.qty.toFixed(3)} BTC</span></div></div>)}
          {!walls.length && <div className="p-3 text-muted-foreground">{isLive ? "No walls above threshold" : "Waiting for synchronized depth"}</div>}
        </aside>
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-2">RESTING USDT <span className="liquidity-spectrum h-1.5 w-20" /> LOW → HIGH</span>
        <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-wall" /> ≥ {notional(threshold)}</span>
        <span className="ml-auto">{frames.length ? `${Math.round(frames.length / 2)}s captured` : "0s captured"} · UTC · {frozen ? "PAUSED" : "500ms"}</span>
        <span className="w-full text-[9px]">Displayed liquidity can cancel at any time · History begins on connection · Binance spot, not the full market</span>
      </footer>
    </div>
  );
}