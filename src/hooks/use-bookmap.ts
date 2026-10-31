import { useEffect, useRef, useState } from 'react';
import { fromSnapshot, type DepthEvent, type DepthSnapshot } from '@/lib/order-book';
import { applyMarketDepth, binDepth, depthCoverage, emptyMarket, recordVolume, type Execution, type Market, type MarketData } from '@/lib/bookmap';

export function useBookmap(market: Market) {
  const [data, setData] = useState<MarketData>(() => emptyMarket(market));
  const state = useRef<MarketData>(emptyMarket(market));
  useEffect(() => {
    const s = emptyMarket(market); state.current = s;
    let stopped = false, generation = 0, attempt = 0, bridged = false;
    let ws: WebSocket | undefined, retry: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined, abort: AbortController | undefined;
    let buy = 0, sell = 0, lastTradeId = -1;
    const publish = () => { if (!stopped) setData({ ...s, frames: [...s.frames], tape: [...s.tape], executions: [...s.executions], liquidations: [...s.liquidations], volumes: s.volumes.map(b => ({ ...b })), tick: Date.now() }); };
    const connect = () => {
      if (stopped) return;
      const g = ++generation;
      s.book = null; bridged = false; s.lastDepth = 0; s.status = attempt ? 'reconnecting' : 'connecting'; publish();
      const buffer: (DepthEvent & { pu?: number })[] = [];
      const alternate = attempt % 2 === 1;
      const url = market === 'spot' ? `${alternate ? 'wss://stream.binance.com:9443' : 'wss://data-stream.binance.vision'}/stream?streams=btcusdt@depth@100ms/btcusdt@aggTrade` : 'wss://fstream.binance.com/stream?streams=btcusdt@depth@100ms/btcusdt@aggTrade/btcusdt@forceOrder';
      const socket = new WebSocket(url); ws = socket;
      const alive = () => !stopped && g === generation;
      const fail = () => {
        if (!alive()) return;
        generation++; abort?.abort(); clearTimeout(watchdog); socket.close();
        s.book = null; bridged = false; s.status = 'reconnecting'; publish();
        retry = setTimeout(connect, Math.min(30_000, 2000 * 2 ** Math.min(attempt++, 4)));
      };
      const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(fail, 15_000); };
      arm();
      socket.onopen = async () => {
        if (!alive()) return;
        s.status = 'syncing'; publish(); abort = new AbortController();
        try {
          const endpoint = market === 'spot' ? `${alternate ? 'https://api.binance.com' : 'https://data-api.binance.vision'}/api/v3/depth?symbol=BTCUSDT&limit=5000` : 'https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=1000';
          const response = await fetch(endpoint, { signal: abort.signal });
          if (!response.ok) throw new Error('Snapshot unavailable');
          const snapshot = await response.json() as DepthSnapshot;
          if (!alive()) return;
          if (!Number.isFinite(snapshot.lastUpdateId) || !Array.isArray(snapshot.bids) || !Array.isArray(snapshot.asks)) throw new Error('Invalid snapshot');
          s.book = fromSnapshot(snapshot);
          for (const e of buffer) {
            const result = applyMarketDepth(s.book, e, market, bridged);
            if (result === 'gap') { fail(); return; }
            if (result === 'applied') { bridged = true; s.lastDepth = Date.now(); }
          }
          buffer.length = 0;
          s.status = bridged ? 'live' : 'syncing'; publish();
        } catch { fail(); }
      };
      socket.onmessage = event => {
        if (!alive()) return;
        try {
          const { stream, data: d } = JSON.parse(event.data);
          if (stream.endsWith('@depth@100ms')) {
            arm();
            if (!s.book) { buffer.push(d); if (buffer.length > 2000) fail(); return; }
            const result = applyMarketDepth(s.book, d, market, bridged);
            if (result === 'gap') { fail(); return; }
            if (result === 'applied') { bridged = true; s.lastDepth = Date.now(); s.status = 'live'; attempt = 0; }
          } else if (stream.endsWith('@aggTrade')) {
            const t: Execution = { id: +d.a, time: +d.T, price: +d.p, qty: +d.q, side: d.m ? 'sell' : 'buy' };
            if (![t.id, t.time, t.price, t.qty].every(Number.isFinite) || t.price <= 0 || t.qty <= 0 || t.id <= lastTradeId) return;
            lastTradeId = t.id; s.price = t.price; if (!s.started) s.started = t.time;
            s.cvd += t.side === 'buy' ? t.qty : -t.qty;
            if (t.side === 'buy') buy += t.qty; else sell += t.qty;
            recordVolume(s.volumes, t); s.executions.push(t);
            if (s.executions.length > 6000) s.executions.splice(0, s.executions.length - 6000);
            if (t.qty * t.price >= 100_000) { s.tape.unshift(t); s.tape.length = Math.min(80, s.tape.length); }
          } else if (stream.endsWith('@forceOrder')) {
            const o = d.o, qty = +o.z, price = +o.ap || +o.p, time = +o.T;
            if (qty > 0 && price > 0 && Number.isFinite(time)) {
              const id = `${time}-${o.S}-${price}-${qty}`;
              if (!s.liquidations.some(l => l.id === id)) s.liquidations.unshift({ id, time, price, qty, side: o.S === 'SELL' ? 'long' : 'short' });
              s.liquidations.length = Math.min(1000, s.liquidations.length);
            }
          }
        } catch { fail(); }
      };
      socket.onclose = fail; socket.onerror = fail;
    };
    connect();
    const timer = setInterval(() => {
      const now = Date.now();
      if (s.book && bridged && s.price > 0 && now - s.lastDepth < 5000) {
        s.frames.push({ time: now, price: s.price, bins: binDepth(s.book, 10, 0, Infinity), cvd: s.cvd, buy, sell, coverage: depthCoverage(s.book) });
        if (s.frames.length > 600) s.frames.shift();
      }
      buy = 0; sell = 0;
      s.executions = s.executions.filter(t => t.time >= now - 10 * 60_000);
      s.liquidations = s.liquidations.filter(t => t.time >= now - 24 * 3600_000);
      publish();
    }, 1000);
    return () => { stopped = true; generation++; clearInterval(timer); clearTimeout(retry); clearTimeout(watchdog); abort?.abort(); ws?.close(); };
  }, [market]);
  return data;
}
