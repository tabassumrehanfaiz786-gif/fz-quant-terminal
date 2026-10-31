import { useEffect, useRef, useState } from 'react';
import { binDepth, bubbleRadius, type MarketData } from '@/lib/bookmap';

export function MarketCanvas({ data, macro, minutes, bubbleMin }: { data: MarketData; macro: boolean; minutes: number; bubbleMin: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) => { if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height }); });
    observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !size.w || !size.h) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size.w * dpr; el.height = size.h * dpr; ctx.scale(dpr, dpr);
    const style = getComputedStyle(el), color = (name: string) => style.getPropertyValue(name).trim();
    const heat = Array.from({ length: 7 }, (_, i) => color(`--bookmap-heat-${i + 1}`));
    const w = size.w, h = size.h, domW = w < 450 ? 95 : 114, left = 6, top = 12;
    const plotW = w - domW - left, plotH = h - 170;
    const center = Math.round(data.price / 100) * 100;
    const min = macro ? 40_000 : center - 1500, max = macro ? 100_000 : center + 1500;
    const step = macro ? 1000 : 50;
    const end = data.tick || Date.now(), start = end - minutes * 60_000;
    const x = (t: number) => left + (t - start) / (end - start) * plotW;
    const y = (p: number) => top + (max - p) / (max - min) * plotH;
    ctx.fillStyle = color('--bookmap-surface'); ctx.fillRect(0, 0, w, h);
    ctx.font = "9px 'JetBrains Mono', monospace";
    const visible = data.frames.filter(f => f.time >= start && f.time <= end);
    const shade = (qty: number) => heat[Math.min(6, Math.max(0, Math.floor(Math.log2(1 + qty / (macro ? 15 : 0.3)))))] ?? heat[0] ?? color('--bookmap-cyan');
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, plotW, plotH); ctx.clip();
    const cellW = plotW / (minutes * 60), cellH = step / (max - min) * plotH;
    for (const f of visible) {
      const bins = new Map<number, number>();
      for (const [p, qty] of f.bins) {
        if (p < min || p > max) continue;
        const bin = Math.floor(p / step) * step;
        bins.set(bin, (bins.get(bin) ?? 0) + qty);
      }
      for (const [p, qty] of bins) {
        ctx.fillStyle = shade(qty);
        ctx.fillRect(x(f.time) - cellW, y(p + step), Math.max(1, cellW + 0.2), Math.max(1, cellH));
      }
    }
    ctx.strokeStyle = color('--bookmap-cyan'); ctx.globalAlpha = 0.23; ctx.lineWidth = 0.5; ctx.setLineDash([2, 3]);
    for (let i = 0; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(left + plotW * i / 5, top); ctx.lineTo(left + plotW * i / 5, top + plotH); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.strokeStyle = color('--foreground'); ctx.lineWidth = 1;
    ctx.beginPath();
    let previous = 0;
    for (const f of visible) { if (!previous || f.time - previous > 2000) ctx.moveTo(x(f.time), y(f.price)); else ctx.lineTo(x(f.time), y(f.price)); previous = f.time; }
    ctx.stroke();
    for (const t of data.executions) {
      if (t.time < start || t.time > end || t.qty < bubbleMin || t.price < min || t.price > max) continue;
      ctx.globalAlpha = 0.65; ctx.fillStyle = color(t.side === 'buy' ? '--up' : '--down');
      ctx.beginPath(); ctx.arc(x(t.time), y(t.price), bubbleRadius(t.qty), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (data.price) {
      ctx.strokeStyle = color('--bookmap-cyan'); ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(left, y(data.price)); ctx.lineTo(left + plotW, y(data.price)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    // Observed DOM only: blank rows are unknown, not zero liquidity.
    const bins = data.book ? binDepth(data.book, step, min, max) : new Map<number, number>();
    const maximum = Math.max(1, ...bins.values());
    ctx.fillStyle = color('--card'); ctx.fillRect(left + plotW, top, domW, plotH);
    const labelStep = macro ? 1000 : 100;
    ctx.textAlign = 'left';
    for (let p = max; p >= min; p -= labelStep) {
      const yy = y(p);
      if (yy > top + plotH - 5 || (data.price && Math.abs(yy - y(data.price)) < 13)) continue;
      const qty = bins.get(Math.floor(p / step) * step);
      if (qty) { ctx.globalAlpha = 0.38; ctx.fillStyle = shade(qty); ctx.fillRect(left + plotW + 50, yy - 6, qty / maximum * (domW - 51), 10); ctx.globalAlpha = 1; }
      ctx.fillStyle = color('--muted-foreground'); ctx.fillText(String(p), left + plotW + 4, yy + 3);
      ctx.fillStyle = color(p < data.price ? '--up' : '--down'); ctx.fillText(qty ? qty.toFixed(1) : '—', left + plotW + 55, yy + 3);
    }
    if (data.price >= min && data.price <= max) {
      const py = y(data.price); ctx.fillStyle = color('--bookmap-cyan'); ctx.fillRect(left + plotW, py - 9, domW, 18);
      ctx.fillStyle = color('--background'); ctx.fillText(data.price.toFixed(2), left + plotW + 5, py + 3);
    }
    // Per-second executed volume histogram, followed by session CVD.
    const volumeTop = top + plotH + 5, volumeH = 38, cvdTop = volumeTop + 62, cvdH = 63;
    const maxVol = Math.max(1, ...visible.map(f => Math.max(f.buy, f.sell)));
    for (const f of visible) {
      ctx.fillStyle = color('--up'); ctx.fillRect(x(f.time) - cellW, volumeTop + volumeH - f.buy / maxVol * volumeH, Math.max(1, cellW / 2), f.buy / maxVol * volumeH);
      ctx.fillStyle = color('--down'); ctx.fillRect(x(f.time) - cellW / 2, volumeTop + volumeH - f.sell / maxVol * volumeH, Math.max(1, cellW / 2), f.sell / maxVol * volumeH);
    }
    ctx.strokeStyle = color('--border'); ctx.lineWidth = 1;
    for (const yy of [volumeTop, cvdTop - 8]) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
    ctx.fillStyle = color('--muted-foreground'); ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) ctx.fillText(new Date(start + i * (end - start) / 4).toISOString().slice(11, 19), Math.max(28, Math.min(plotW - 20, left + i * plotW / 4)), volumeTop + volumeH + 14);
    const cvdMin = Math.min(0, ...visible.map(f => f.cvd)), cvdMax = Math.max(0, ...visible.map(f => f.cvd));
    const cy = (v: number) => cvdTop + cvdH - (v - cvdMin) / Math.max(1, cvdMax - cvdMin) * cvdH;
    ctx.strokeStyle = color(data.cvd >= 0 ? '--up' : '--down'); ctx.beginPath(); previous = 0;
    for (const f of visible) { if (!previous || f.time - previous > 2000) ctx.moveTo(x(f.time), cy(f.cvd)); else ctx.lineTo(x(f.time), cy(f.cvd)); previous = f.time; } ctx.stroke();
    ctx.fillStyle = color('--muted-foreground'); ctx.textAlign = 'left'; ctx.fillText('CVD · BTC', 8, cvdTop + 10);
    ctx.textAlign = 'center'; ctx.fillStyle = color('--bookmap-cyan'); ctx.fillText(data.cvd.toFixed(2), left + plotW + domW / 2, cvdTop + 35);
    ctx.fillStyle = color('--muted-foreground'); ctx.fillText('SESSION', left + plotW + domW / 2, cvdTop + 50);
    if (!visible.length) {
      ctx.textAlign = 'center'; ctx.fillStyle = color('--foreground');
      ctx.fillText(data.status === 'reconnecting' ? 'Depth unavailable · reconnecting' : 'Synchronizing live Binance depth…', left + plotW / 2, top + plotH / 2);
    }
    if (pointer.current && pointer.current.x < left + plotW && pointer.current.y < top + plotH) {
      const point = pointer.current, p = max - (point.y - top) / plotH * (max - min), t = start + (point.x - left) / plotW * (end - start);
      const f = visible.find(f => Math.abs(f.time - t) < 1000);
      let qty = 0; if (f) for (const [price, q] of f.bins) if (Math.floor(price / step) === Math.floor(p / step)) qty += q;
      ctx.strokeStyle = color('--foreground'); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(point.x, top); ctx.lineTo(point.x, top + plotH); ctx.stroke(); ctx.setLineDash([]);
      const label = `${Math.floor(p / step) * step} · ${f && qty ? qty.toFixed(2) + ' BTC' : 'No observed depth'}`;
      ctx.fillStyle = color('--card'); ctx.fillRect(5, 5, Math.min(w - 10, ctx.measureText(label).width + 16), 22);
      ctx.textAlign = 'left'; ctx.fillStyle = color('--foreground'); ctx.fillText(label, 12, 19);
    }
  }, [data, macro, minutes, bubbleMin, size]);
  return <div ref={host} className="relative h-full min-h-[600px] min-w-0"><canvas ref={canvas} aria-label={`${data.market === 'spot' ? 'Spot' : 'Perpetual'} live liquidity heatmap, executed trades, depth ladder, volume and CVD`} className="absolute inset-0 h-full w-full cursor-crosshair" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top }; setSize(s => ({ ...s })); }} onPointerLeave={() => { pointer.current = null; setSize(s => ({ ...s })); }} /></div>;
}
