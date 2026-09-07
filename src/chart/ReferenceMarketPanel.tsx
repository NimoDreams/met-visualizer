import { useEffect } from "react";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import type { CandleInterval } from "../providers/geckoTerminal";
import { useReferenceMarket } from "../app/useReferenceMarket";
import { ReferenceChart } from "./ReferenceChart";
import type { ReferenceMarketSession } from "../domain/referenceMarket";
import type { LiquidityOverlayModel } from "../domain/liquidityOverlay";

const intervals: CandleInterval[] = ["5m", "15m", "1h", "4h"];

export type ReferencePanelStatus = {
  state: "idle" | "loading" | "current" | "stale" | "error";
  label: string;
  basis?: string;
  market?: string;
};

export function ReferenceMarketPanel({
  mint,
  rpc,
  overlay,
  onSessionChange,
  onStatusChange,
  onHoverPositionKeys,
}: {
  mint?: string;
  rpc?: ReadOnlySolanaRpc;
  overlay?: LiquidityOverlayModel;
  onSessionChange?: (session?: ReferenceMarketSession) => void;
  onStatusChange?: (status: ReferencePanelStatus) => void;
  onHoverPositionKeys?: (keys: readonly string[]) => void;
}) {
  const { state, retry, refresh, changeInterval, changeMarket, loadOlder } =
    useReferenceMarket(mint, rpc);

  useEffect(() => {
    onSessionChange?.(state.status === "ready" ? state.session : undefined);
  }, [onSessionChange, state]);

  useEffect(() => {
    onStatusChange?.(describePanelStatus(state));
  }, [onStatusChange, state]);

  if (state.status === "idle") {
    return (
      <article className="chart-panel surface" aria-labelledby="chart-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Reference market</p>
            <h2 id="chart-heading">Awaiting token CA</h2>
          </div>
        </div>
        <ReferenceChart />
        <p className="chart-note">
          Connect an RPC and enter a token CA to load keyless GeckoTerminal
          candles.
        </p>
      </article>
    );
  }

  if (state.status === "loading") {
    return (
      <article
        className="chart-panel surface"
        aria-busy="true"
        aria-labelledby="chart-heading"
      >
        <p className="eyebrow">GeckoTerminal · keyless public data</p>
        <h2 id="chart-heading">Finding a reference market…</h2>
        <div
          aria-label="Loading reference-market candles"
          className="chart-loading"
          role="status"
        />
        <p className="chart-note">
          Checking up to three liquidity-and-volume-ranked markets for completed
          USD candles.
        </p>
      </article>
    );
  }

  if (state.status === "error") {
    return (
      <article className="chart-panel surface" aria-labelledby="chart-heading">
        <p className="eyebrow">Reference market unavailable</p>
        <h2 id="chart-heading">{errorTitle(state.kind)}</h2>
        <div className="market-error" role="alert">
          <p>{state.message}</p>
          <p>
            Meteora pool and position data remain available independently. See
            the <a href="#/docs">Docs</a> for provider limits and recovery.
          </p>
          <button className="button-secondary" type="button" onClick={retry}>
            Retry chart
          </button>
        </div>
        <ReferenceChart />
      </article>
    );
  }

  const { session } = state;
  const busy = state.action !== "idle";
  const first = session.candles[0];
  const last = session.candles.at(-1);

  return (
    <article
      className="chart-panel surface"
      aria-busy={busy}
      aria-labelledby="chart-heading"
    >
      <div className="panel-heading market-heading">
        <div>
          <p className="eyebrow">GeckoTerminal · keyless public data</p>
          <h2 id="chart-heading">
            {session.token.name} <span>{session.token.symbol}</span>
          </h2>
        </div>
        <div className="market-badges">
          <span className={`status freshness-${session.freshness.state}`}>
            {state.stale ? "Stale" : freshnessLabel(session.freshness.state)}
          </span>
          {session.limitedHistory ? (
            <span className="status history-limited">Limited history</span>
          ) : null}
        </div>
      </div>

      <div className="chart-controls">
        <div className="timeframe-controls" aria-label="Candle timeframe">
          {intervals.map((interval) => (
            <button
              className={session.interval === interval ? "active" : ""}
              disabled={busy}
              key={interval}
              onClick={() => void changeInterval(interval)}
              type="button"
            >
              {interval}
            </button>
          ))}
        </div>
        <div className="chart-actions">
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() => void loadOlder()}
            type="button"
          >
            {state.action === "backfilling" ? "Loading…" : "Load older"}
          </button>
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() => void refresh()}
            type="button"
          >
            {state.action === "refreshing" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="reference-selector">
        <label htmlFor="reference-market">Reference market</label>
        <select
          disabled={busy}
          id="reference-market"
          onChange={(event) => void changeMarket(event.target.value)}
          value={session.market.address}
        >
          {session.candidates.map((candidate) => (
            <option key={candidate.address} value={candidate.address}>
              {candidate.name} · {candidate.dexId} ·{" "}
              {shortAddress(candidate.address)}
            </option>
          ))}
        </select>
        <p>
          Changing this market reloads the full series. Automatic refresh never
          switches it.
        </p>
      </div>

      <dl className="market-metadata">
        <div>
          <dt>Axis</dt>
          <dd>
            {session.basis.label} · {session.basis.source}
          </dd>
        </div>
        <div>
          <dt>Pair / DEX</dt>
          <dd>
            {session.market.name} · {session.market.dexId}
          </dd>
        </div>
        <div>
          <dt>Pool</dt>
          <dd className="pool-address">{session.market.address}</dd>
        </div>
        <div>
          <dt>Liquidity / 24h volume</dt>
          <dd>
            {formatUsd(session.market.reserveUsd)} /{" "}
            {formatUsd(session.market.volume24hUsd)}
          </dd>
        </div>
        <div>
          <dt>Interval / history</dt>
          <dd>
            {session.interval} · {formatHistory(first?.time, last?.time)}
          </dd>
        </div>
        <div>
          <dt>Last trade / activity</dt>
          <dd>
            {session.market.lastTradeTimestamp
              ? formatTime(session.market.lastTradeTimestamp * 1_000)
              : session.market.recentTrades !== undefined
                ? `${session.market.recentTrades} recent transactions`
                : "Not reported"}
          </dd>
        </div>
        <div>
          <dt>Observed / refresh</dt>
          <dd>{formatTime(session.observedAt)} · 60s while visible</dd>
        </div>
      </dl>

      {session.basis.kind !== "price" ? (
        <p className="chart-disclosure">
          Historical {session.basis.label} candles use one current session
          supply observed {formatTime(session.basis.observedAt)}; they do not
          reconstruct historical supply.
        </p>
      ) : (
        <p className="chart-disclosure warning">
          Price-only view: {session.basis.reason}
        </p>
      )}

      <ReferenceChart
        session={session}
        overlay={overlay}
        onHoverPositionKeys={onHoverPositionKeys}
      />
      <p className="chart-note">
        {session.freshness.detail} Candles are a cached market-data view, not a
        tick stream.
      </p>

      {state.actionError ? (
        <p className="market-action-error" role="alert">
          Last-good candles remain visible. {state.actionError} See the{" "}
          <a href="#/docs">Docs</a> for refresh and stale-data behavior.
        </p>
      ) : null}

      {session.rejected.length > 0 ? (
        <details className="selection-notes">
          <summary>
            Automatic selection notes ({session.rejected.length})
          </summary>
          <ul>
            {session.rejected.map((candidate) => (
              <li key={candidate.address}>
                {candidate.name}: {candidate.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function describePanelStatus(
  state: ReturnType<typeof useReferenceMarket>["state"],
): ReferencePanelStatus {
  if (state.status === "idle") return { state: "idle", label: "Chart waiting" };
  if (state.status === "loading")
    return { state: "loading", label: "Chart loading" };
  if (state.status === "error")
    return { state: "error", label: "Chart unavailable" };
  return {
    state: state.stale
      ? "stale"
      : state.action === "idle"
        ? "current"
        : "loading",
    label: state.stale
      ? "Chart stale"
      : state.action === "idle"
        ? state.session.freshness.state === "delayed"
          ? "Chart delayed"
          : state.session.freshness.state === "unknown"
            ? "Chart freshness unknown"
            : "Chart current"
        : state.action === "backfilling"
          ? "Chart loading history"
          : state.action === "changing"
            ? "Chart changing"
            : "Chart refreshing",
    basis: state.session.basis.label,
    market: `${state.session.market.name} · ${state.session.market.dexId}`,
  };
}

function errorTitle(kind: string): string {
  return (
    {
      "no-market": "No usable market found",
      "rate-limit": "Public request limit reached",
      network: "Network request failed",
      "provider-shape": "Provider response changed",
      provider: "Provider request failed",
    }[kind] ?? "Reference market unavailable"
  );
}

function freshnessLabel(state: string): string {
  return state === "current"
    ? "Current"
    : state === "delayed"
      ? "Delayed"
      : "Freshness unknown";
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function formatUsd(value?: number): string {
  if (value === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatHistory(first?: number, last?: number): string {
  if (first === undefined || last === undefined) return "Unknown";
  const hours = Math.max(0, last - first) / 3_600;
  if (hours < 2) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} hr`;
  return `${Math.round(hours / 24)} days`;
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}
