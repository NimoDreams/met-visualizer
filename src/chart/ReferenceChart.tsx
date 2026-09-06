import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import { LiquidityProfilePrimitive } from "./LiquidityProfilePrimitive";

const start = 1_788_696_000;
const closes = [0.237, 0.243, 0.241, 0.251, 0.258, 0.255, 0.267, 0.272];

const candles: CandlestickData<UTCTimestamp>[] = closes.map((close, index) => {
  const open = index === 0 ? 0.232 : (closes[index - 1] ?? close);
  return {
    time: (start + index * 900) as UTCTimestamp,
    open,
    high: Math.max(open, close) * 1.018,
    low: Math.min(open, close) * 0.982,
    close,
  };
});

const volume: HistogramData<UTCTimestamp>[] = closes.map((close, index) => ({
  time: (start + index * 900) as UTCTimestamp,
  value: 18_000 + index * 7_300,
  color: close >= (closes[index - 1] ?? close) ? "#3ecf8e88" : "#ff6b7a88",
}));

export function ReferenceChart() {
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
      rightPriceScale: { borderColor: "#314159" },
      timeScale: { borderColor: "#314159", timeVisible: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#3ecf8e",
      downColor: "#ff6b7a",
      borderVisible: false,
      wickUpColor: "#3ecf8e",
      wickDownColor: "#ff6b7a",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    candleSeries.setData(candles);

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeries.setData(volume);

    const profile = new LiquidityProfilePrimitive([
      { price: 0.242, weight: 32 },
      { price: 0.251, weight: 78 },
      { price: 0.259, weight: 100 },
      { price: 0.267, weight: 58 },
    ]);
    candleSeries.attachPrimitive(profile);
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, []);

  return (
    <div
      ref={containerRef}
      className="chart-canvas"
      aria-label="Sample reference candlestick chart with liquidity profile"
      role="img"
    />
  );
}
