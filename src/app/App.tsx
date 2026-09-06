import { FormEvent, useEffect, useRef, useState } from "react";
import { ReferenceMarketPanel } from "../chart/ReferenceMarketPanel";
import { isSolanaAddress } from "../domain/solanaAddress";
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

function DocsView() {
  return (
    <main className="docs-view">
      <p className="eyebrow">How this app treats your data</p>
      <h1>Docs</h1>
      <div className="docs-grid">
        <section className="surface">
          <h2>Session-only RPC</h2>
          <p>
            Your RPC endpoint stays in this page’s memory. It is cleared when
            you disconnect, replace it, reload, or close the page. It is never
            placed in browser storage, the URL, analytics, or market-data
            requests.
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
          <h2>Reference market and units</h2>
          <p>
            GeckoTerminal ranks markets by liquidity and recent volume. The app
            checks up to three and keeps one identified market stable until you
            explicitly change it. A refresh never switches pools silently.
          </p>
        </section>
        <section className="surface">
          <h2>Market Cap, FDV, and Price</h2>
          <p>
            Verified provider market cap is preferred. Otherwise the chart uses
            current on-chain mint supply and says FDV. If supply is unavailable,
            it stays useful as Price (USD). Historical valuation candles reuse
            that current session supply; they are not historical supply records.
          </p>
        </section>
        <section className="surface">
          <h2>Sources and refresh</h2>
          <p>
            Candles and quote prices use GeckoTerminal’s keyless public API and
            a shared conservative request budget. The selected chart polls no
            faster than every 60 seconds while visible. Solana supply and future
            DLMM snapshots use only your RPC and refresh separately.
          </p>
        </section>
        <section className="surface">
          <h2>Current liquidity snapshot</h2>
          <p>
            Future DLMM overlays will convert the other pool token through a
            current public USD quote and use the chart’s supply basis. They show
            current liquidity, not liquidity at a historical candle. Unsupported
            conversions stay visible without a common-axis overlay.
          </p>
        </section>
      </div>
    </main>
  );
}

export function App() {
  const route = useHashRoute();
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

      {route === "docs" ? (
        <DocsView />
      ) : (
        <main>
          <section className="hero">
            <div>
              <p className="eyebrow">Read-only Solana liquidity research</p>
              <h1>See where Meteora liquidity sits around a token.</h1>
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
                HTTPS only. Held in memory for this page session and never
                saved.
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

          <section className="workspace" aria-label="Visualization workspace">
            <ReferenceMarketPanel
              key={activeToken?.sequence}
              mint={activeToken?.mint}
              rpc={rpcSession?.client}
            />

            <aside className="positions-panel surface">
              <p className="eyebrow">Meteora DLMM</p>
              <h2>Pools &amp; positions</h2>
              <div className="empty-state">
                <span aria-hidden="true">⌁</span>
                <p>
                  Connect your RPC and load a token CA. Pool discovery arrives
                  in a later issue.
                </p>
              </div>
              <dl className="session-summary">
                <div>
                  <dt>RPC</dt>
                  <dd>
                    {rpcConnected ? "Session connected" : "Not connected"}
                  </dd>
                </div>
                <div>
                  <dt>Token</dt>
                  <dd>{activeToken ? "CA accepted" : "Not loaded"}</dd>
                </div>
              </dl>
            </aside>
          </section>
        </main>
      )}
    </div>
  );
}
