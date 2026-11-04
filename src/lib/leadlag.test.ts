import { describe, expect, it } from "vitest";
import { arbEdge, basisBps, leadLag } from "./leadlag";

describe("lead-lag", () => {
  it("basis in bps", () => expect(basisBps(100.1, 100)).toBeCloseTo(10));
  it("finds leader moving 3 samples earlier", () => {
    const lead = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i * 0.7) + (i % 7) * 0.3);
    const follow = [100, 100, 100, ...lead.slice(0, 77)];
    expect(leadLag(lead, follow, 6).lag).toBe(3);
    expect(leadLag(follow, lead, 6).lag).toBe(-3);
  });
  it("arb only opens when gap beats two legs of fees", () => {
    expect(arbEdge(15, 7.5).open).toBe(false);
    expect(arbEdge(-16, 7.5)).toEqual({ net: 1, open: true });
  });
});
