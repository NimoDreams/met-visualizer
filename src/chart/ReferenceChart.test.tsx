import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LiquidityOverlayModel } from "../domain/liquidityOverlay";
import type { ReferenceMarketSession } from "../domain/referenceMarket";
import { LiquidityProfilePrimitive } from "./LiquidityProfilePrimitive";
import { ReferenceChart } from "./ReferenceChart";

const mocks = vi.hoisted(() => {
  const candleSeries = {
    setData: vi.fn(),
    applyOptions: vi.fn(),
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
  };
  const volumeSeries = {
    setData: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
  };
  const timeScale = {
    fitContent: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => ({ from: 10, to: 20 })),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  const chart = {
    addSeries: vi
      .fn()
      .mockReturnValueOnce(candleSeries)
      .mockReturnValueOnce(volumeSeries),
    timeScale: () => timeScale,
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  };
  return { candleSeries, chart, timeScale };
});

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
  HistogramSeries: {},
  createChart: vi.fn(() => mocks.chart),
}));

describe("ReferenceChart overlay lifecycle", () => {
  it("updates its primitive without recreating or fitting the chart viewport", async () => {
    const { createChart } = await import("lightweight-charts");
    const updatePrimitive = vi.spyOn(
      LiquidityProfilePrimitive.prototype,
      "update",
    );
    const first = overlay("first", 1_000);
    const second = overlay("second", 1_100);
    const view = render(<ReferenceChart session={session()} overlay={first} />);
    const chart = view.getByRole("img");

    expect(createChart).toHaveBeenCalledOnce();
    expect(mocks.timeScale.fitContent).toHaveBeenCalledOnce();
    expect(chart).toHaveAttribute(
      "data-visible-logical-range",
      "10.000000:20.000000",
    );
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledOnce();

    view.rerender(<ReferenceChart session={session()} overlay={second} />);

    expect(createChart).toHaveBeenCalledOnce();
    expect(mocks.timeScale.fitContent).toHaveBeenCalledOnce();
    expect(mocks.candleSeries.attachPrimitive).toHaveBeenCalledOnce();
    expect(mocks.candleSeries.detachPrimitive).not.toHaveBeenCalled();
    expect(updatePrimitive).toHaveBeenCalledWith(second.levels);
    expect(chart).toHaveAttribute(
      "data-visible-logical-range",
      "10.000000:20.000000",
    );

    view.unmount();
    expect(mocks.candleSeries.detachPrimitive).toHaveBeenCalledOnce();
    expect(mocks.chart.remove).toHaveBeenCalledOnce();
    updatePrimitive.mockRestore();
  });
});

function overlay(id: string, axisPrice: number): LiquidityOverlayModel {
  return {
    levels: [
      {
        id,
        axisPrice,
        valueUsd: { numerator: 1n, denominator: 1n },
        contributions: [],
      },
    ],
  } as unknown as LiquidityOverlayModel;
}

function session(): ReferenceMarketSession {
  return {
    mint: "mint",
    token: {
      address: "mint",
      name: "Token",
      symbol: "TKN",
      decimals: 6,
      observedAt: 1,
    },
    basis: {
      kind: "fdv",
      label: "FDV (USD)",
      source: "current Solana mint supply",
      displaySupply: 1_000,
      observedAt: 1,
    },
    candidates: [],
    market: {
      address: "market",
      name: "TKN / USD",
      dexId: "fixture",
      baseMint: "mint",
      quoteMint: "usd",
      tokenSide: "base",
    },
    candles: [
      {
        time: 1,
        open: 1,
        high: 2,
        low: 1,
        close: 2,
        volume: 10,
        priceOpen: 0.001,
        priceHigh: 0.002,
        priceLow: 0.001,
        priceClose: 0.002,
      },
    ],
    interval: "15m",
    limitedHistory: false,
    freshness: { state: "current", detail: "fixture" },
    rejected: [],
    observedAt: 1,
  };
}
