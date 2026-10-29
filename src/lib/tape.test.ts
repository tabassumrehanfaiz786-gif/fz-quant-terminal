import { describe, it, expect } from "vitest";
import { roundQty, tierFor, filterPrints, DEFAULT_TIERS, type Print } from "./tape";

describe("tape", () => {
  it("rounds order size to the chosen step", () => {
    expect(roundQty(2.37, 0.5)).toBe(2.5);
    expect(roundQty(7.4, 5)).toBe(5);
    expect(roundQty(0.123, 0)).toBe(0.123);
  });
  it("assigns the highest reached size tier", () => {
    expect(tierFor(0.4, DEFAULT_TIERS).name).toBe("Retail");
    expect(tierFor(5, DEFAULT_TIERS).name).toBe("Whale");
    expect(tierFor(25, DEFAULT_TIERS).name).toBe("Institutional");
  });
  it("filters by minimum rounded size", () => {
    const p: Print[] = [
      { id: 1, time: 0, price: 1, qty: 0.9, side: "buy" },
      { id: 2, time: 0, price: 1, qty: 0.4, side: "sell" },
    ];
    expect(filterPrints(p, 1, 1).map((x) => x.id)).toEqual([1]);
  });
});
