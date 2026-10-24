import { useEffect, useRef, useState } from "react";
import { applyDepth, captureFrame, fromSnapshot, MAX_FRAMES, SAMPLE_MS, type Book, type DepthEvent, type DepthSnapshot, type HeatFrame } from "@/lib/order-book";

export type DepthFeed = "connecting" | "syncing" | "live" | "reconnecting";
export function useOrderBook() {
  const frames = useRef<HeatFrame[]>([]);
  const [data, setData] = useState<{ feed: DepthFeed; price: number; lastUpdate: number; frames: HeatFrame[]; bid: number; ask: number }>({ feed: "connecting", price: 0, lastUpdate: 0, frames: [], bid: 0, ask: 0 });
  useEffect(() => {
    let disposed = false, ws: WebSocket | null = null, book: Book | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null, attempt = 0, generation = 0;
    let price = 0, lastUpdate = 0, synced = false, bid = 0, ask = 0;
    let feed: DepthFeed = "connecting";
    const publish = () => !disposed && setData({ feed, price, lastUpdate, frames: [...frames.current], bid, ask });
    const connect = () => {
      if (disposed) return;
      const current = ++generation;
      book = null; synced = false;
      feed = attempt ? "reconnecting" : "connecting"; publish();
      const buffer: DepthEvent[] = [];
      const marketOnly = attempt % 2 === 0;
      const socket = new WebSocket(`${marketOnly ? "wss://data-stream.binance.vision" : "wss://stream.binance.com:9443"}/stream?streams=btcusdt@depth@100ms/btcusdt@aggTrade/btcusdt@bookTicker`);
      ws = socket;
      const alive = () => !disposed && generation === current;
      const fail = () => {
        if (!alive()) return;
        ++generation; controller?.abort(); clearTimeout(watchdog); socket.close();
        book = null; synced = false; feed = "reconnecting"; publish();
        retry = setTimeout(connect, Math.min(30_000, 2000 * 2 ** Math.min(attempt++, 4)));
      };
      const armWatchdog = () => { clearTimeout(watchdog); watchdog = setTimeout(fail, 15_000); };
      armWatchdog();
      socket.onopen = async () => {
        if (!alive()) return;
        feed = "syncing"; publish();
        controller = new AbortController();
        try {
          const response = await fetch(`${marketOnly ? "https://data-api.binance.vision" : "https://api.binance.com"}/api/v3/depth?symbol=BTCUSDT&limit=5000`, { signal: controller.signal });
          if (!response.ok) throw new Error("Depth snapshot unavailable");
          const snapshot = await response.json() as DepthSnapshot;
          if (!alive()) return;
          if (!Number.isFinite(snapshot.lastUpdateId) || !Array.isArray(snapshot.bids) || !Array.isArray(snapshot.asks)) throw new Error("Invalid depth snapshot");
          const next = fromSnapshot(snapshot);
          for (const event of buffer) if (applyDepth(next, event) === "gap") { fail(); return; }
          book = next;
          // Remain syncing until a stream event bridges the snapshot.
          synced = buffer.some(event => event.u > snapshot.lastUpdateId);
          if (synced) { feed = "live"; attempt = 0; }
          buffer.length = 0; publish();
        } catch { fail(); }
      };
      socket.onmessage = ev => {
        if (!alive()) return;
        try {
          const { stream, data: message } = JSON.parse(ev.data);
          if (stream === "btcusdt@depth@100ms") {
            armWatchdog();
            const event = message as DepthEvent;
            if (!book) { buffer.push(event); if (buffer.length > 2000) fail(); return; }
            const result = applyDepth(book, event);
            if (result === "gap") { fail(); return; }
            if (result === "applied") { synced = true; feed = "live"; attempt = 0; lastUpdate = Date.now(); }
          } else if (stream === "btcusdt@aggTrade") {
            const tradePrice = Number(message.p);
            if (Number.isFinite(tradePrice) && tradePrice > 0) price = tradePrice;
          } else if (stream === "btcusdt@bookTicker") {
            bid = Number(message.b); ask = Number(message.a);
          }
        } catch { fail(); }
      };
      socket.onerror = fail; socket.onclose = fail;
    };
    connect();
    const sampling = setInterval(() => {
      if (book && synced && price > 0 && Date.now() - lastUpdate < 5000) {
        frames.current.push(captureFrame(book, price, Date.now()));
        if (frames.current.length > MAX_FRAMES) frames.current.shift();
      }
      publish();
    }, SAMPLE_MS);
    return () => { disposed = true; ++generation; clearInterval(sampling); clearTimeout(retry); clearTimeout(watchdog); controller?.abort(); ws?.close(); };
  }, []);
  return data;
}