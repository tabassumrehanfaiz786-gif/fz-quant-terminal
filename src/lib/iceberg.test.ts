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
    onTrade(s, 80000, 8, true, 4);
    const [ice] = activeIcebergs(s, cfg);
    expect(ice?.executed).toBe(12);
    expect(ice?.hidden).toBe(8.5);
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

import { describe as d2, it as i2, expect as e2 } from "vitest";
import { createIcebergState as cs, onQuote as oq, onTrade as ot, activeIcebergs as ai } from "./iceberg";
d2("iceberg false positives", () => {
  i2("does not flag a busy level where new visible orders keep arriving", () => {
    const s = cs(); const cfg = { minBtc: 5, ratio: 3 };
    oq(s, "bid", 70000, 2, 0, cfg);
    for (let k = 0; k < 10; k++) { ot(s, 70000, 2, true, k); oq(s, "bid", 70000, 0, k, cfg); oq(s, "bid", 70000, 2, k, cfg); }
    e2(ai(s, cfg)).toHaveLength(0);
  });
  i2("flags fills that never show up in the book", () => {
    const s = cs(); const cfg = { minBtc: 5, ratio: 3 };
    oq(s, "bid", 70000, 2, 0, cfg);
    for (let k = 0; k < 10; k++) { ot(s, 70000, 2, true, k); oq(s, "bid", 70000, 2, k, cfg); }
    e2(ai(s, cfg)).toHaveLength(1);
  });
});
