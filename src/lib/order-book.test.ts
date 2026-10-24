import { describe, expect, it } from "vitest";
import { applyDepth, captureFrame, detectWalls, fromSnapshot } from "./order-book";

describe("Binance resting liquidity", () => {
  it("uses absolute quantities and removes zero-quantity orders", () => {
    const book = fromSnapshot({ lastUpdateId: 10, bids: [["70000", "2"]], asks: [["70010", "3"]] });
    expect(applyDepth(book, { U: 11, u: 12, E: 1, b: [["70000", "4"]], a: [["70010", "0"]] })).toBe("applied");
    expect(book.bids.get(70000)).toBe(4);
    expect(book.asks.has(70010)).toBe(false);
  });
  it("ignores stale events and rejects sequence gaps without mutating the book", () => {
    const book = fromSnapshot({ lastUpdateId: 10, bids: [["70000", "2"]], asks: [] });
    expect(applyDepth(book, { U: 9, u: 10, E: 1, b: [["70000", "9"]], a: [] })).toBe("stale");
    expect(applyDepth(book, { U: 12, u: 13, E: 1, b: [["70000", "9"]], a: [] })).toBe("gap");
    expect(book.bids.get(70000)).toBe(2);
    expect(book.lastId).toBe(10);
  });
  it("marks large passive orders at their actual price rather than combining small orders", () => {
    expect(detectWalls([{ price: 70000, qty: 20, side: "bid" }, { price: 70001, qty: 1, side: "ask" }], 1_000_000)).toEqual([{ price: 70000, qty: 20, side: "bid" }]);
  });
  it("retains independent historical snapshots when current orders change", () => {
    const book = fromSnapshot({ lastUpdateId: 10, bids: [["70000", "20"]], asks: [] });
    const frame = captureFrame(book, 70000, 1000);
    applyDepth(book, { U: 11, u: 11, E: 2, b: [["70000", "0"]], a: [] });
    expect(frame.bins.get(70000)).toBe(1_400_000);
    expect(captureFrame(book, 70000, 1500).bins.size).toBe(0);
  });
});