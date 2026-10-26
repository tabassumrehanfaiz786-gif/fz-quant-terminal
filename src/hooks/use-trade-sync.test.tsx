import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createEngine, type Trade } from "@/lib/strategy";
import { useTradeSync } from "./use-trade-sync";
const mocks = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.sync }));
vi.mock("@/lib/coach.functions", () => ({ syncPaperTrades: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const trade: Trade = { id: 1, side: "long", level: 80000, entry: 80200, exit: 82700, entryTime: 100, exitTime: 200, pnl: 1200, reason: "RUNNER" };
const engines = () => { const sweep = createEngine("sweep"); sweep.trades.push(trade); return { sweep, touch: createEngine("touch") }; };
beforeEach(() => { vi.clearAllMocks(); mocks.sync.mockResolvedValue({ saved: 1 }); });
it("does not save signed-out trades", () => {
  renderHook(() => useTradeSync(engines(), "15m", null));
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("saves again for a replacement engine and for a different account", async () => {
  const first = engines();
  const { rerender } = renderHook(({ e, user }) => useTradeSync(e, "15m", user), { initialProps: { e: first, user: "account-a" } });
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(1));
  rerender({ e: engines(), user: "account-a" });
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2));
  rerender({ e: first, user: "account-b" });
  await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(3));
});