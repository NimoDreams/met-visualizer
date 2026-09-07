import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ReferenceMarketPanel,
  type ReferencePanelStatus,
} from "../chart/ReferenceMarketPanel";
import {
  DlmmPoolsPanel,
  type PositionsPanelStatus,
} from "../components/DlmmPoolsPanel";
import { isSolanaAddress } from "../domain/solanaAddress";
import type { ReferenceMarketSession } from "../domain/referenceMarket";
import type { LiquidityOverlayModel } from "../domain/liquidityOverlay";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import { RpcSessionManager, type RpcSession } from "./session";
import { useHashRoute } from "./useHashRoute";

function validateRpc(value: string): string | undefined {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:"
      ? undefined
      : "Use an HTTPS RPC endpoint.";
  } catch {
    return "Enter a complete HTTPS RPC endpoint.";
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function DocsView({ hidden }: { hidden: boolean }) {
  return (
    <main className="docs-view" hidden={hidden} id="docs-content">
      <p className="eyebrow">How this app treats your data</p>
      <h1 data-route-heading="docs" tabIndex={-1}>
        Docs
      </h1>
      <p className="docs-intro">
        Met Visualizer compares a public market chart with a current, read-only
        snapshot of Meteora DLMM liquidity. These notes explain the display, its
        sources, and when a result may be partial or stale.
      </p>
      <div className="docs-grid">
        <section className="surface">
          <h2>Start with a token CA</h2>
          <p>
            Connect an HTTPS Solana RPC, then paste a token’s Solana contract
            address (CA). Symbols never select a token or market. This research
            view does not connect a wallet or prepare trades.
          </p>
        </section>
        <section className="surface">
          <h2>Session-only RPC and privacy</h2>
          <p>
            Your RPC endpoint stays in this page’s memory. It is cleared when
            you disconnect, replace it, reload, or close the page. It is never
            placed in browser storage, the URL, analytics, or market-data
            requests. Your browser sends read-only JSON-RPC calls directly to
            that endpoint, so its operator can observe those calls.
          </p>
        </section>
        <section className="surface">
          <h2>Read-only scope</h2>
          <p>
            Met Visualizer reads public Solana and Meteora data for research. It
            has no wallet connection, signing, transactions, swaps, or liquidity
            controls.
          </p>
        </section>
        <section className="surface">
          <h2>Reference-market selection</h2>
          <p>
            GeckoTerminal candidates are ranked by USD reserve, then 24-hour
            volume and address. The app validates completed candles from up to
            three candidates, excluding blacklisted, inactive, non-USD, and
            structurally invalid markets. It keeps the identified market stable
            across refreshes. Only your Reference market selection changes it.
          </p>
        </section>
        <section className="surface">
          <h2>Market Cap, FDV, and Price</h2>
          <p>
            Verified provider market cap is preferred. Otherwise the chart uses
            current on-chain mint supply and says FDV. If supply is unavailable,
            it uses Price (USD). Historical valuation candles reuse that current
            session supply, so they are price history scaled by one present
            supply observation rather than historical supply records.
          </p>
        </section>
        <section className="surface">
          <h2>Sources, cadence, and attribution</h2>
          <p>
            Candles and quote prices use the keyless public{" "}
            <a href="https://www.geckoterminal.com/" rel="noreferrer">
              GeckoTerminal API
            </a>{" "}
            under a shared limit of 10 dispatched calls per rolling minute. Its
            public API is beta, cached for about one minute, and its effective
            public allowance can fluctuate. The keyless{" "}
            <a href="https://docs.meteora.ag/" rel="noreferrer">
              Meteora Data API
            </a>{" "}
            provides ranking metadata, while your{" "}
            <a href="https://solana.com/docs/rpc" rel="noreferrer">
              Solana RPC
            </a>{" "}
            determines pool identity and account state. Candles poll no faster
            than every 60 seconds while the page is visible. Pool and position
            snapshots refresh only when requested. Charts use{" "}
            <a
              href="https://www.tradingview.com/lightweight-charts/"
              rel="noreferrer"
            >
              TradingView Lightweight Charts™
            </a>
            ; TradingView does not provide this app’s market data.
          </p>
          <p className="docs-attribution">
            TradingView Lightweight Charts™ Copyright © 2025 TradingView, Inc.
          </p>
        </section>
        <section className="surface">
          <h2>DLMM pool selection</h2>
          <p>
            RPC discovery is authoritative and ranking metadata is advisory. The
            app initially enables one eligible pool with the highest trustworthy
            TVL rank; uncertain ranking requires manual choice. You may enable
            or disable every discovered, decodable pool. Refresh preserves
            manual choices and never replaces the reference market.
          </p>
        </section>
        <section className="surface">
          <h2>Progressive position loading</h2>
          <p>
            Enabled pools load all owners’ PositionV2 accounts in bounded RPC
            batches, rank a compact snapshot, then hydrate the largest positions
            first. The initial view targets at least 25 positions and, when a
            complete value denominator exists, about 80% of known value. Load
            next adds a bounded batch; Load all continues progressively. Cancel
            stops active work. Count and value coverage answer different
            questions and are shown separately.
          </p>
        </section>
        <section className="surface">
          <h2>Valuation and unavailable values</h2>
          <p>
            Current principal uses one current conversion price per pool
            snapshot. Bin prices locate liquidity ranges; they are not future
            prices used to value principal. Missing USD quotes, unsupported
            layouts, absent bins, and incomplete RPC snapshots stay visible as
            unavailable or unknown and are excluded from complete-value claims.
          </p>
        </section>
        <section className="surface">
          <h2>Overlay, selection, and filters</h2>
          <p>
            Enabled pools share the chart’s Market Cap, FDV, or Price axis. Pool
            and position checkboxes control the overlay. The global minimum uses
            current USD position value across every enabled pool. Largest
            contributors becomes available only when every enabled pool shares
            one coherent, complete valuation generation; it covers about 80% of
            known value.
          </p>
        </section>
        <section className="surface">
          <h2>Snapshots, stale data, and recovery</h2>
          <p>
            Candles, supply, quotes, pools, and positions have separate observed
            times and can fail independently. During refresh, last-good data
            remains visible. A failed refresh is labeled stale; incomplete data
            is never estimated into a complete denominator. Retry the affected
            chart, pool discovery, or position load. Phone pane switches keep
            selections, filters, loaded extent, and the chart range in memory.
          </p>
        </section>
        <section className="surface">
          <h2>Limits</h2>
          <p>
            Public APIs can throttle, omit new or inactive tokens, change
            response shapes, or return delayed cached data. RPC servers vary in
            indexing, CORS support, limits, and slot freshness. Results are
            observational research, not execution prices, historical liquidity,
            financial advice, or a guarantee that every account was returned.
          </p>
        </section>
      </div>
    </main>
  );
}

function VisualizationWorkspace({
  mint,
  rpc,
}: {
  mint?: string;
  rpc?: ReadOnlySolanaRpc;
}) {
  const [activePane, setActivePane] = useState<"chart" | "positions">("chart");
  const [reference, setReference] = useState<ReferenceMarketSession>();
  const [overlay, setOverlay] = useState<LiquidityOverlayModel>();
  const [referenceStatus, setReferenceStatus] = useState<ReferencePanelStatus>({
    state: "idle",
    label: "Chart waiting",
  });
  const [positionsStatus, setPositionsStatus] = useState<PositionsPanelStatus>({
    state: "idle",
    label: "Positions waiting",
    selectedIncluded: 0,
    valued: 0,
  });
  const [hoveredPositionKeys, setHoveredPositionKeys] = useState<
    readonly string[]
  >([]);
  const reportReference = useCallback(
    (session?: ReferenceMarketSession) => setReference(session),
    [],
  );
  const reportOverlay = useCallback(
    (model?: LiquidityOverlayModel) => setOverlay(model),
    [],
  );
  const reportHover = useCallback(
    (keys: readonly string[]) => setHoveredPositionKeys(keys),
    [],
  );

  return (
    <section aria-label="Visualization workspace">
      <div className="mobile-workspace-header">
        <div className="mobile-pane-switch" aria-label="Visible workspace pane">
          <button
            aria-pressed={activePane === "chart"}
            onClick={() => setActivePane("chart")}
            type="button"
          >
            Chart
          </button>
          <button
            aria-pressed={activePane === "positions"}
            onClick={() => setActivePane("positions")}
            type="button"
          >
            Positions
          </button>
        </div>
        <div
          className="compact-workspace-status"
          role="status"
          aria-live="polite"
        >
          <strong>{mint ? shortAddress(mint) : "No token loaded"}</strong>
          <span>
            {referenceStatus.market ?? "Reference pending"} ·{" "}
            {referenceStatus.basis ?? "Axis pending"}
          </span>
          <span>
            {positionsStatus.selectedIncluded.toLocaleString()} selected and
            included ·{" "}
            {positionsStatus.coverage === undefined
              ? "known value coverage unavailable"
              : `${positionsStatus.coverage.toFixed(1)}% of known value`}
          </span>
          <span>
            {referenceStatus.label} · {positionsStatus.label}
          </span>
        </div>
      </div>

      <div className="workspace">
        <div
          className={`workspace-pane workspace-chart ${activePane !== "chart" ? "mobile-pane-inactive" : ""}`}
        >
          <ReferenceMarketPanel
            mint={mint}
            rpc={rpc}
            overlay={overlay}
            onSessionChange={reportReference}
            onStatusChange={setReferenceStatus}
            onHoverPositionKeys={reportHover}
          />
        </div>

        <div
          className={`workspace-pane workspace-positions ${activePane !== "positions" ? "mobile-pane-inactive" : ""}`}
        >
          <DlmmPoolsPanel
            mint={mint}
            rpc={rpc}
            reference={reference}
            hoveredPositionKeys={hoveredPositionKeys}
            onOverlayChange={reportOverlay}
            onStatusChange={setPositionsStatus}
          />
        </div>
      </div>
    </section>
  );
}

export function App() {
  const route = useHashRoute();
  const previousRoute = useRef(route);
  const sessionManager = useRef(new RpcSessionManager());
  const tokenSequence = useRef(0);
  const [rpcInput, setRpcInput] = useState("");
  const [rpcConnected, setRpcConnected] = useState(false);
  const [rpcSession, setRpcSession] = useState<RpcSession>();
  const [rpcError, setRpcError] = useState<string>();
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState<string>();
  const [activeToken, setActiveToken] = useState<{
    mint: string;
    sequence: number;
  }>();

  useEffect(() => {
    const manager = sessionManager.current;
    return () => manager.disconnect();
  }, []);

  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    document
      .querySelector<HTMLElement>(`[data-route-heading="${route}"]`)
      ?.focus();
  }, [route]);

  function connectRpc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = rpcInput.trim();
    const error = validateRpc(normalized);
    if (error) {
      setRpcError(error);
      return;
    }

    const session = sessionManager.current.connect(normalized);
    setRpcSession(session);
    setRpcConnected(true);
    setActiveToken(undefined);
    setRpcError(undefined);
    setRpcInput("");
  }

  function disconnectRpc() {
    sessionManager.current.disconnect();
    setRpcConnected(false);
    setRpcSession(undefined);
    setActiveToken(undefined);
    setRpcInput("");
  }

  function loadToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = tokenInput.trim();

    if (!isSolanaAddress(normalized)) {
      setTokenError("Enter a valid Solana token contract address.");
      return;
    }
    if (!rpcConnected) {
      setTokenError("Connect a read-only RPC before loading a token.");
      return;
    }

    setTokenError(undefined);
    setActiveToken({ mint: normalized, sequence: ++tokenSequence.current });
  }

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href={route === "docs" ? "#/docs" : "#/"}
        onClick={(event) => {
          event.preventDefault();
          document
            .querySelector<HTMLElement>(`[data-route-heading="${route}"]`)
            ?.focus();
        }}
      >
        Skip to main content
      </a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Met Visualizer home">
          <span className="brand-mark">M</span>
          <span>Met Visualizer</span>
        </a>
        <nav aria-label="Primary">
          <a
            aria-current={route === "visualization" ? "page" : undefined}
            href="#/"
          >
            Visualizer
          </a>
          <a aria-current={route === "docs" ? "page" : undefined} href="#/docs">
            Docs
          </a>
        </nav>
      </header>

      <DocsView hidden={route !== "docs"} />
      <main hidden={route !== "visualization"} id="visualizer-content">
        <section className="hero">
          <div>
            <p className="eyebrow">Read-only Solana liquidity research</p>
            <h1 data-route-heading="visualization" tabIndex={-1}>
              See where Meteora liquidity sits around a token.
            </h1>
            <p className="hero-copy">
              Enter a Solana token contract address (CA) to view its reference
              chart, DLMM pools, and current position distribution.
            </p>
          </div>

          <form className="rpc-form surface" onSubmit={connectRpc}>
            <div className="field-heading">
              <label htmlFor="rpc-endpoint">Your Solana RPC endpoint</label>
              <span className={rpcConnected ? "status connected" : "status"}>
                {rpcConnected ? "Connected" : "Required"}
              </span>
            </div>
            <p className="field-help" id="rpc-help">
              HTTPS only. Held in memory for this page session and never saved.
            </p>
            <div className="field-row">
              <input
                id="rpc-endpoint"
                name="rpc-endpoint"
                type="password"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={`rpc-help${rpcError ? " rpc-error" : ""}`}
                aria-invalid={Boolean(rpcError)}
                placeholder="https://your-solana-rpc.example/…"
                value={rpcInput}
                onChange={(event) => setRpcInput(event.target.value)}
              />
              <button type="submit">
                {rpcConnected ? "Replace RPC" : "Connect RPC"}
              </button>
              {rpcConnected ? (
                <button
                  className="button-secondary"
                  type="button"
                  onClick={disconnectRpc}
                >
                  Disconnect
                </button>
              ) : null}
            </div>
            {rpcError ? (
              <p className="field-error" id="rpc-error" role="alert">
                {rpcError}
              </p>
            ) : null}
          </form>
        </section>

        <form className="token-form surface" onSubmit={loadToken}>
          <label htmlFor="token-address">Token contract address (CA)</label>
          <p className="field-help" id="token-help">
            Paste the token’s Solana address. Symbols are not used to choose a
            market.
          </p>
          <div className="field-row">
            <input
              id="token-address"
              name="token-address"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`token-help${tokenError ? " token-error" : ""}`}
              aria-invalid={Boolean(tokenError)}
              placeholder="Enter token CA"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            <button type="submit">Load token</button>
          </div>
          {tokenError ? (
            <p className="field-error" id="token-error" role="alert">
              {tokenError}
            </p>
          ) : null}
        </form>

        <VisualizationWorkspace
          key={activeToken?.sequence ?? "idle"}
          mint={activeToken?.mint}
          rpc={rpcSession?.client}
        />
      </main>
    </div>
  );
}
