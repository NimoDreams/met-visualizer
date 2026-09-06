import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import type {
  ReferenceMarketSession,
  ValuationCandle,
} from "../domain/referenceMarket";

export function ReferenceChart({
  session,
}: {
  session?: ReferenceMarketSession;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "#101827" },
        textColor: "#9fb0c8",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#26344a" },
        horzLines: { color: "#26344a" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#314159" },
      timeScale: { borderColor: "#314159", timeVisible: true },
    });

    if (!session) return () => chart.remove();

    const precision = pricePrecision(session.candles);
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3ecf8e",
      downColor: "#ff6b7a",
      borderVisible: false,
      wickUpColor: "#3ecf8e",
      wickDownColor: "#ff6b7a",
      priceFormat: {
        type: "price",
        precision,
        minMove: 10 ** -precision,
      },
    });
    candleSeries.setData(session.candles.map(toChartCandle));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeries.setData(session.candles.map(toChartVolume));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [session]);

  return (
    <div
      ref={containerRef}
      className="chart-canvas"
      aria-label={
        session
          ? `${session.token.symbol} ${session.basis.label} reference candlestick chart`
          : "Reference candlestick chart awaiting a token"
      }
      role="img"
    />
  );
}

function toChartCandle(candle: ValuationCandle): CandlestickData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function toChartVolume(candle: ValuationCandle): HistogramData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open ? "#3ecf8e88" : "#ff6b7a88",
  };
}

function pricePrecision(candles: ValuationCandle[]): number {
  const last = candles.at(-1)?.close ?? 1;
  if (last >= 1_000) return 0;
  if (last >= 1) return 2;
  if (last >= 0.01) return 4;
  return 8;
}
