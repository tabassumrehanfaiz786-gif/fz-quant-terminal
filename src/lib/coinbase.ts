// Coinbase Exchange public BTC-USD feeds (reachable where Binance is ISP-blocked).
export const CB_WS = "wss://ws-feed.exchange.coinbase.com";
export const CB_REST = "https://api.exchange.coinbase.com";

export type CbMatch = { id: number; time: number; price: number; qty: number; side: "buy" | "sell" };

/** Coinbase `side` is the maker side; the aggressor (taker) is the opposite. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMatch(d: any): CbMatch | null {
  if (d?.type !== "match" && d?.type !== "last_match") return null;
  return { id: +d.trade_id, time: Date.parse(d.time), price: +d.price, qty: +d.size, side: d.side === "sell" ? "buy" : "sell" };
}

export function openMatches(onMatch: (m: CbMatch) => void, onOpen: () => void, onClose: () => void): WebSocket {
  const ws = new WebSocket(CB_WS);
  ws.onopen = () => { ws.send(JSON.stringify({ type: "subscribe", product_ids: ["BTC-USD"], channels: ["matches"] })); onOpen(); };
  ws.onmessage = (e) => { const m = parseMatch(JSON.parse(e.data)); if (m) onMatch(m); };
  ws.onclose = onClose;
  return ws;
}
