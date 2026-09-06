import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import { useDlmmPools } from "../app/useDlmmPools";
import { usePoolPositions } from "../app/usePoolPositions";
import type { DlmmPoolItem } from "../domain/dlmmPools";

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
      {state.status === "ready" && rpc ? (
        <PoolResults
          session={state.session}
          actionError={state.actionError}
          onToggle={toggle}
          rpc={rpc}
        />
      ) : null}
    </aside>
  );
}

function PoolResults({
  session,
  actionError,
  onToggle,
  rpc,
}: {
  session: Extract<
    ReturnType<typeof useDlmmPools>["state"],
    { status: "ready" }
  >["session"];
  actionError?: string;
  onToggle: (address: string) => void;
  rpc: ReadOnlySolanaRpc;
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
                {enabled && ready ? (
                  <PoolPositions
                    key={pool.address}
                    pool={pool}
                    mint={session.mint}
                    minContextSlot={session.maximumSlot}
                    rpc={rpc}
                  />
                ) : null}
              </details>
            );
          })}
        </div>
      )}
      <p className="pool-footnote">
        RPC is authoritative for pool identity. Meteora’s keyless API ranks
        current candidates. Enabled pools discover and value PositionV2 accounts
        from the connected RPC; no endpoint data is sent to either public
        provider.
      </p>
      <p className="pool-footnote">
        RPC slots {session.minimumSlot.toLocaleString()}–
        {session.maximumSlot.toLocaleString()} · {session.metadataRequests}{" "}
        ranking requests
      </p>
    </>
  );
}

function PoolPositions({
  rpc,
  pool,
  mint,
  minContextSlot,
}: {
  rpc: ReadOnlySolanaRpc;
  pool: DlmmPoolItem;
  mint: string;
  minContextSlot: number;
}) {
  const { state, cancel, restart, refresh, reveal, toggle } = usePoolPositions(
    rpc,
    pool,
    mint,
    minContextSlot,
  );
  if (state.status === "loading") {
    return (
      <div className="position-progress" role="status">
        <strong>Loading positions…</strong>
        <span>
          {state.progress.hydrated.toLocaleString()} of{" "}
          {state.progress.discovered.toLocaleString()} accounts hydrated
        </span>
        <button className="button-secondary" type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }
  if (state.status === "cancelled") {
    return (
      <div className="position-progress warning" role="status">
        <span>
          Loading cancelled after {state.progress.hydrated.toLocaleString()} of{" "}
          {state.progress.discovered.toLocaleString()} accounts.
        </span>
        <button className="button-secondary" type="button" onClick={restart}>
          Restart
        </button>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="market-error position-error" role="alert">
        <strong>Positions unavailable</strong>
        <p>{state.message}</p>
        <button className="button-secondary" type="button" onClick={restart}>
          Retry
        </button>
      </div>
    );
  }

  const { session } = state;
  const visible = session.positions.slice(0, session.visibleCount);
  const loadedValue = visible.reduce(
    (sum, position) => sum + (position.valueUsdMicros ?? 0n),
    0n,
  );
  const valuePercent =
    session.valueCoverage === "complete" && session.totalValueUsdMicros
      ? Number((loadedValue * 10_000n) / session.totalValueUsdMicros) / 100
      : undefined;
  return (
    <section className="pool-positions" aria-label="Pool positions">
      <div className="position-coverage">
        <strong>
          {session.visibleCount.toLocaleString()} /{" "}
          {session.discoveredCount.toLocaleString()} positions loaded
        </strong>
        <span>
          Value coverage:{" "}
          {valuePercent === undefined
            ? "Unknown (subset)"
            : `${valuePercent.toFixed(1)}%`}
        </span>
        <span>
          {session.selectedAddresses.length.toLocaleString()} loaded positions
          selected
        </span>
        <span>
          {session.binArrayCount.toLocaleString()} bin arrays loaded
          {session.missingBinCount > 0
            ? ` · ${session.missingBinCount.toLocaleString()} bins unavailable`
            : ""}
        </span>
      </div>
      <p className="pool-detail-note">{session.detail}</p>
      {session.stale && state.actionError ? (
        <div className="market-action-error" role="alert">
          Position refresh failed. Last-good snapshot remains visible.{" "}
          {state.actionError}
        </div>
      ) : null}
      <div className="position-actions">
        <button
          className="button-secondary"
          type="button"
          disabled={state.refreshing}
          onClick={refresh}
        >
          {state.refreshing ? "Refreshing…" : "Refresh positions"}
        </button>
        {state.refreshing ? (
          <button className="button-secondary" type="button" onClick={cancel}>
            Cancel refresh
          </button>
        ) : null}
        {session.visibleCount < session.positions.length ? (
          <>
            <button
              className="button-secondary"
              type="button"
              onClick={() => reveal("next")}
            >
              Load next 100
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => reveal("all")}
            >
              Load all
            </button>
          </>
        ) : null}
      </div>
      <div className="position-list">
        {visible.map((position) => (
          <label className="position-row" key={position.address}>
            <input
              type="checkbox"
              checked={session.selectedAddresses.includes(position.address)}
              onChange={() => toggle(position.address)}
            />
            <span>
              <strong>{shortAddress(position.address)}</strong>
              <small>
                bins {position.lowerBinId}–{position.upperBinId} · owner{" "}
                {shortAddress(position.owner)}
              </small>
            </span>
            <b>{formatUsdMicros(position.valueUsdMicros)}</b>
          </label>
        ))}
      </div>
      <p className="position-metrics">
        RPC slots {session.minimumSlot.toLocaleString()}–
        {session.maximumSlot.toLocaleString()} · {session.requests} RPC requests
        · {formatBytes(session.bytes)} · {session.elapsedMs.toLocaleString()} ms
        · observed {new Date(session.observedAt).toLocaleTimeString()} ·
        portable batched RPC
      </p>
    </section>
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

function formatUsdMicros(value?: bigint): string {
  if (value === undefined) return "Value unknown";
  const cents = (value + 5_000n) / 10_000n;
  const dollars = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `$${dollars.toLocaleString()}.${fraction}`;
}

function formatBytes(value: number): string {
  return value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)} MB`
    : `${Math.round(value / 1_000)} KB`;
}
