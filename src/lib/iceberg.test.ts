import { describe, it, expect } from "vitest";
import { createIcebergState, onQuote, onTrade, activeIcebergs } from "./iceberg";

const cfg = { minBtc: 5, ratio: 3 };

describe("iceberg detector", () => {
  it("flags a bid that absorbs far more than it displayed", () => {
    const s = createIcebergState();
    onQuote(s, "bid", 80000, 2, 0, cfg);
    onTrade(s, 80000, 4, true, 1);
    onQuote(s, "bid", 80000, 0.5, 2, cfg);
    onQuote(s, "bid", 80000, 2, 3, cfg); // reload
    onTrade(s, 80000, 6, true, 4);
    const [ice] = activeIcebergs(s, cfg);
    expect(ice?.executed).toBe(10);
    expect(ice?.hidden).toBe(8);
    expect(ice?.refills).toBe(1);
  });
  it("ignores fills within visible size", () => {
    const s = createIcebergState();
    onQuote(s, "ask", 80010, 10, 0, cfg);
    onTrade(s, 80010, 8, false, 1);
    expect(activeIcebergs(s, cfg)).toEqual([]);
  });
  it("logs broken when price trades through the iceberg", () => {
    const s = createIcebergState();
    onQuote(s, "bid", 80000, 1, 0, cfg);
    onTrade(s, 80000, 6, true, 1);
    onQuote(s, "bid", 79999, 3, 2, cfg);
    expect(s.found[0]?.outcome).toBe("broken");
  });
});
