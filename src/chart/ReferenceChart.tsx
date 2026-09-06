import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import type {
  ReferenceMarketSession,
  ValuationCandle,
} from "../domain/referenceMarket";
import type { LiquidityOverlayModel } from "../domain/liquidityOverlay";
import { rationalToNumber } from "../domain/liquidityOverlay";
import {
  LiquidityProfilePrimitive,
  type LiquidityHover,
} from "./LiquidityProfilePrimitive";

export function ReferenceChart({
  session,
  overlay,
  onHoverPositionKeys,
}: {
  session?: ReferenceMarketSession;
  overlay?: LiquidityOverlayModel;
  onHoverPositionKeys?: (keys: readonly string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | undefined>(
    undefined,
  );
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | undefined>(
    undefined,
  );
  const primitiveRef = useRef<LiquidityProfilePrimitive | undefined>(undefined);
  const sessionRef = useRef(session);
  const overlayRef = useRef(overlay);
  const hoverCallbackRef = useRef(onHoverPositionKeys);
  const [hoverState, setHoverState] = useState<{
    overlay?: LiquidityOverlayModel;
    value: LiquidityHover;
  }>();
  const hover =
    hoverState && hoverState.overlay === overlay ? hoverState.value : undefined;
  const sessionIdentity = session
    ? [
        session.mint,
        session.market.address,
        session.interval,
        session.basis.kind,
        session.basis.displaySupply,
      ].join(":")
    : "empty";

  useEffect(() => {
    sessionRef.current = session;
    overlayRef.current = overlay;
    hoverCallbackRef.current = onHoverPositionKeys;
  }, [onHoverPositionKeys, overlay, session]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeSession = sessionRef.current;
    hoverCallbackRef.current?.([]);

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
    if (!activeSession)
      return () => {
        chart.remove();
      };

    const precision = pricePrecision(activeSession.candles);
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
    candleSeriesRef.current = candleSeries;
    candleSeries.setData(activeSession.candles.map(toChartCandle));

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;
    volumeSeries.setData(activeSession.candles.map(toChartVolume));
    chart.timeScale().fitContent();

    const handleCrosshair = (event: { hoveredObjectId?: unknown }) => {
      const next = primitiveRef.current?.hover(event.hoveredObjectId);
      const activeOverlay = overlayRef.current;
      setHoverState(next ? { overlay: activeOverlay, value: next } : undefined);
      hoverCallbackRef.current?.(
        next
          ? [
              ...new Set(
                next.contributions.map(({ positionKey }) => positionKey),
              ),
            ]
          : [],
      );
    };
    const publishVisibleRange = (range: LogicalRange | null) => {
      container.dataset.visibleLogicalRange = range
        ? `${range.from.toFixed(6)}:${range.to.toFixed(6)}`
        : "";
    };
    chart.subscribeCrosshairMove(handleCrosshair);
    chart.timeScale().subscribeVisibleLogicalRangeChange(publishVisibleRange);
    publishVisibleRange(chart.timeScale().getVisibleLogicalRange());

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshair);
      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(publishVisibleRange);
      if (primitiveRef.current) {
        candleSeries.detachPrimitive(primitiveRef.current);
        primitiveRef.current = undefined;
      }
      candleSeriesRef.current = undefined;
      volumeSeriesRef.current = undefined;
      primitiveRef.current = undefined;
      chart.remove();
    };
  }, [sessionIdentity]);

  useEffect(() => {
    if (!session || !candleSeriesRef.current || !volumeSeriesRef.current)
      return;
    const precision = pricePrecision(session.candles);
    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: "price",
        precision,
        minMove: 10 ** -precision,
      },
    });
    candleSeriesRef.current.setData(session.candles.map(toChartCandle));
    volumeSeriesRef.current.setData(session.candles.map(toChartVolume));
  }, [session, sessionIdentity]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const previous = primitiveRef.current;
    if (candleSeries && overlay?.levels.length) {
      if (previous) previous.update(overlay.levels);
      else {
        const primitive = new LiquidityProfilePrimitive(overlay.levels);
        primitiveRef.current = primitive;
        candleSeries.attachPrimitive(primitive);
      }
    } else if (previous && candleSeries) {
      candleSeries.detachPrimitive(previous);
      primitiveRef.current = undefined;
    }
    hoverCallbackRef.current?.([]);
  }, [overlay, sessionIdentity]);

  function navigateLiquidity(direction: 1 | -1) {
    const next = primitiveRef.current?.moveHover(direction);
    setHoverState(next ? { overlay, value: next } : undefined);
    onHoverPositionKeys?.(
      next
        ? [...new Set(next.contributions.map(({ positionKey }) => positionKey))]
        : [],
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="chart-canvas"
        aria-label={
          session
            ? `${session.token.symbol} ${session.basis.label} reference candlestick chart with ${overlay?.levels.length ?? 0} selected liquidity levels`
            : "Reference candlestick chart awaiting a token"
        }
        aria-describedby={hover ? "liquidity-hover-detail" : undefined}
        onBlur={() => {
          primitiveRef.current?.hoverLevel(undefined);
          setHoverState(undefined);
          onHoverPositionKeys?.([]);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            navigateLiquidity(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Escape") {
            primitiveRef.current?.hoverLevel(undefined);
            setHoverState(undefined);
            onHoverPositionKeys?.([]);
          }
        }}
        role="img"
        tabIndex={session && overlay?.levels.length ? 0 : undefined}
      />
      {hover ? (
        <div
          className="liquidity-tooltip"
          id="liquidity-hover-detail"
          role="status"
        >
          <strong>
            Liquidity at{" "}
            {formatAxisRange(hover.minimumPrice, hover.maximumPrice)}
          </strong>
          <span>
            {formatUsd(hover.valueUsd)} selected principal in this row
          </span>
          <ul>
            {hover.contributions.slice(0, 5).map((contribution) => (
              <li key={contribution.id}>
                {contribution.poolLabel} ·{" "}
                {shortAddress(contribution.positionAddress)} · bin{" "}
                {contribution.binId}: {formatUsd(contribution.valueUsd)}
              </li>
            ))}
          </ul>
          {hover.contributions.length > 5 ? (
            <span>+{hover.contributions.length - 5} more contributions</span>
          ) : null}
        </div>
      ) : null}
      {session && overlay?.levels.length ? (
        <p className="chart-note liquidity-keyboard-note">
          Focus the chart and use the up/down arrows to inspect liquidity rows.
        </p>
      ) : null}
    </>
  );
}

function formatAxisRange(minimum: number, maximum: number): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: minimum >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: minimum >= 10_000 ? 2 : 6,
  });
  return minimum === maximum
    ? formatter.format(minimum)
    : `${formatter.format(minimum)}–${formatter.format(maximum)}`;
}

function formatUsd(value: import("../domain/positionValuation").Rational) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(rationalToNumber(value));
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
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
