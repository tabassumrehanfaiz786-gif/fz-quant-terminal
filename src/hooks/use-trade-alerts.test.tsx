import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createEngine, type AuditEntry } from "@/lib/strategy";
import { useTradeAlerts } from "./use-trade-alerts";
const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), chime: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/lib/alerts", () => ({ playChime: mocks.chime }));
beforeEach(() => vi.clearAllMocks());
const event = (kind: AuditEntry["kind"], time: number): AuditEntry => ({ kind, time, message: "LONG" });
it("suppresses replay entries and alerts exactly once for a live entry", () => {
  const engine = createEngine("sweep");
  const { rerender } = renderHook(({ ready }) => useTradeAlerts(engine, false, ready), { initialProps: { ready: false } });
  engine.audit.push(event("ENTRY", 1)); rerender({ ready: true });
  expect(mocks.success).not.toHaveBeenCalled();
  engine.audit.push(event("ENTRY", 2)); rerender({ ready: true }); rerender({ ready: true });
  expect(mocks.success).toHaveBeenCalledTimes(1);
  expect(mocks.chime).toHaveBeenCalledWith("entry");
});
it("alerts for live partial and exit events even when a bounded audit shifts", () => {
  const engine = createEngine("sweep");
  engine.audit = Array.from({ length: 500 }, (_, i) => event("SYSTEM", i));
  const { rerender } = renderHook(() => useTradeAlerts(engine, true, true));
  engine.audit.shift(); engine.audit.push(event("PARTIAL", 501)); rerender();
  engine.audit.shift(); engine.audit.push(event("EXIT", 502)); rerender();
  expect(mocks.success).toHaveBeenCalledTimes(2);
  expect(mocks.chime).not.toHaveBeenCalled();
});