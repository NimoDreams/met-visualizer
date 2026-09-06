import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import { useDlmmPools } from "../app/useDlmmPools";

type DlmmPoolsPanelProps = {
  mint?: string;
  rpc?: ReadOnlySolanaRpc;
};

export function DlmmPoolsPanel({ mint, rpc }: DlmmPoolsPanelProps) {
  const { state, refresh, toggle } = useDlmmPools(mint, rpc);

  return (
    <aside className="positions-panel surface">
      <div className="pool-panel-heading">
        <div>
          <p className="eyebrow">Meteora DLMM</p>
          <h2>Pools &amp; positions</h2>
        </div>
        {state.status === "ready" ? (
          <button
            className="button-secondary pool-refresh"
            type="button"
            disabled={state.refreshing}
            onClick={() => void refresh()}
          >
            {state.refreshing ? "Refreshing…" : "Refresh pools"}
          </button>
        ) : null}
      </div>

      {state.status === "idle" ? (
        <PoolEmpty message="Connect your RPC and load a token CA to discover its DLMM pools." />
      ) : null}
      {state.status === "loading" ? (
        <div className="pool-loading" role="status">
          Discovering DLMM pools from your RPC…
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="market-error" role="alert">
          <strong>RPC pool discovery failed</strong>
          <p>{state.message}</p>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <PoolResults
          session={state.session}
          actionError={state.actionError}
          onToggle={toggle}
        />
      ) : null}
    </aside>
  );
}

function PoolResults({
  session,
  actionError,
  onToggle,
}: {
  session: Extract<
    ReturnType<typeof useDlmmPools>["state"],
    { status: "ready" }
  >["session"];
  actionError?: string;
  onToggle: (address: string) => void;
}) {
  return (
    <>
      <div
        className={`pool-status ${session.selectionState === "manual-required" ? "warning" : ""}`}
        role="status"
      >
        <strong>
          {session.enabledAddresses.length} of {session.pools.length} pools
          enabled
        </strong>
        <span>{session.selectionDetail}</span>
      </div>
      {session.metadataState !== "complete" || session.metadataStale ? (
        <div className="chart-disclosure warning">
          Ranking metadata is{" "}
          {session.metadataStale ? "stale" : session.metadataState}.{" "}
          {session.metadataDetail}
        </div>
      ) : null}
      {session.quoteStale ? (
        <div className="chart-disclosure warning">
          The enabled pool is using its last-good USD conversion.
        </div>
      ) : null}
      {session.rpcStale && actionError ? (
        <div className="market-action-error" role="alert">
          RPC refresh failed. Last-good pool data remains visible. {actionError}
        </div>
      ) : null}
      {session.pools.length === 0 ? (
        <PoolEmpty message="No Meteora DLMM pools were discovered for this token." />
      ) : (
        <div className="pool-list">
          {session.pools.map((pool) => {
            const enabled = session.enabledAddresses.includes(pool.address);
            const discovery = pool.discovery;
            const ready = discovery.decodeState === "ready";
            return (
              <details className="pool-entry" key={pool.address}>
                <summary>
                  <input
                    aria-label={`Show pool ${pool.address}`}
                    type="checkbox"
                    checked={enabled}
                    disabled={!ready}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggle(pool.address)}
                  />
                  <span className="pool-summary-copy">
                    <strong>
                      {pool.metadata?.name ?? shortAddress(pool.address)}
                    </strong>
                    <small>
                      {pool.rank ? `Rank ${pool.rank} · ` : ""}
                      {pool.metadata
                        ? `${formatUsd(pool.metadata.tvlUsd)} TVL`
                        : "RPC discovered"}
                    </small>
                  </span>
                  <span
                    className={`pool-state pool-state-${pool.qualification}`}
                  >
                    {qualificationLabel(pool.qualification)}
                  </span>
                </summary>
                <dl className="pool-details">
                  <div>
                    <dt>Pool address</dt>
                    <dd>{pool.address}</dd>
                  </div>
                  {discovery.decodeState === "ready" ? (
                    <>
                      <div>
                        <dt>Token X</dt>
                        <dd>{discovery.tokenXMint}</dd>
                      </div>
                      <div>
                        <dt>Token Y</dt>
                        <dd>{discovery.tokenYMint}</dd>
                      </div>
                      <div>
                        <dt>Bin step / active bin</dt>
                        <dd>
                          {discovery.binStep} / {discovery.activeId}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  {pool.metadata ? (
                    <>
                      <div>
                        <dt>24h volume</dt>
                        <dd>{formatUsd(pool.metadata.volume24hUsd)}</dd>
                      </div>
                      <div>
                        <dt>Metadata observed</dt>
                        <dd>
                          {new Date(
                            pool.metadata.observedAt,
                          ).toLocaleTimeString()}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  {pool.positionCount !== undefined ? (
                    <div>
                      <dt>PositionV2 keys</dt>
                      <dd>{pool.positionCount.toLocaleString()}</dd>
                    </div>
                  ) : null}
                  {pool.quotePrice ? (
                    <div>
                      <dt>Other-token USD quote</dt>
                      <dd>${pool.quotePrice.priceUsd.toLocaleString()}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="pool-detail-note">{pool.qualificationDetail}</p>
              </details>
            );
          })}
        </div>
      )}
      <p className="pool-footnote">
        RPC is authoritative for pool identity. Meteora’s keyless API ranks
        current candidates. Position counts are loaded only for up to three
        initial candidates; full positions arrive in the next implementation
        step.
      </p>
      <p className="pool-footnote">
        RPC slots {session.minimumSlot.toLocaleString()}–
        {session.maximumSlot.toLocaleString()} · {session.metadataRequests}{" "}
        ranking requests
      </p>
    </>
  );
}

function PoolEmpty({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">⌁</span>
      <p>{message}</p>
    </div>
  );
}

function qualificationLabel(value: string): string {
  return (
    {
      qualified: "Ready",
      "not-probed": "Not probed",
      "no-positions": "No positions",
      "no-conversion": "No USD quote",
      blacklisted: "Excluded",
      "non-positive-tvl": "Excluded",
      unranked: "Unranked",
      "decode-unavailable": "Unavailable",
    }[value] ?? value
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}
