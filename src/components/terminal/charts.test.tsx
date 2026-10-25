import { render, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine, type Candle } from "@/lib/strategy";

const mocks = vi.hoisted(() => ({ candles: vi.fn(), equity: vi.fn() }));
vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "candles",
  AreaSeries: "equity",
  createSeriesMarkers: () => ({ setMarkers: vi.fn() }),
  createChart: () => ({
    addSeries: (kind: string) => ({
      setData: kind === "candles" ? mocks.candles : mocks.equity,
      update: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn(),
    }),
    timeScale: () => ({ setVisibleLogicalRange: vi.fn() }),
    remove: vi.fn(),
  }),
}));
import { PriceChart, EquityChart } from "./charts";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("asynchronous chart initialization", () => {
  it("loads existing candles without requiring another market update", async () => {
    const candle: Candle = { time: 1000, open: 80120, high: 80220, low: 79840, close: 80080, volume: 100, buyVolume: 40 };
    render(<PriceChart candles={[candle]} engine={createEngine("sweep")} />);
    await waitFor(() => expect(mocks.candles).toHaveBeenCalledWith([
      { time: 1000, open: 80120, high: 80220, low: 79840, close: 80080 },
    ]));
  });
  it("loads existing equity without requiring another market update", async () => {
    const engine = createEngine("sweep");
    engine.equity = [{ time: 1000, value: 100200 }];
    render(<EquityChart engine={engine} />);
    await waitFor(() => expect(mocks.equity).toHaveBeenCalledWith([{ time: 1000, value: 100200 }]));
  });
});