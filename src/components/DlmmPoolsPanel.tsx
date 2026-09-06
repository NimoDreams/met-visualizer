import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import { useDlmmPools } from "../app/useDlmmPools";
import {
  usePoolPositions,
  type PoolPositionsState,
} from "../app/usePoolPositions";
import type { DlmmPoolItem } from "../domain/dlmmPools";
import {
  addRational,
  rationalPercentage,
  type Rational,
} from "../domain/positionValuation";
import {
  buildLiquidityOverlay,
  parseMinimumUsd,
  positionOverlayKey,
  type LiquidityFilter,
  type LiquidityOverlayModel,
  type PoolOverlayInput,
} from "../domain/liquidityOverlay";
import type { ReferenceMarketSession } from "../domain/referenceMarket";

type DlmmPoolsPanelProps = {
  mint?: string;
  rpc?: ReadOnlySolanaRpc;
  reference?: ReferenceMarketSession;
  hoveredPositionKeys?: readonly string[];
  onOverlayChange?: (model?: LiquidityOverlayModel) => void;
};

export function DlmmPoolsPanel({
  mint,
  rpc,
  reference,
  hoveredPositionKeys = [],
  onOverlayChange,
}: DlmmPoolsPanelProps) {
  const { state, refresh, toggle } = useDlmmPools(mint, rpc);
  const [positionStates, setPositionStates] = useState<
    Record<string, PoolPositionsState>
  >({});
  const [activatedPools, setActivatedPools] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [filter, setFilter] = useState<LiquidityFilter>({ mode: "all" });
  const [minimumInput, setMinimumInput] = useState("");
  const [minimumError, setMinimumError] = useState<string>();
  const [showAllRequest, setShowAllRequest] = useState(0);
  const [valuationGeneration, setValuationGeneration] = useState(1);
  const readySession = state.status === "ready" ? state.session : undefined;
  const enabledInputs = useMemo<PoolOverlayInput[]>(() => {
    if (!readySession) return [];
    return readySession.enabledAddresses.flatMap((address) => {
      const pool = readySession.pools.find((item) => item.address === address);
      if (!pool) return [];
      const positionState = positionStates[address];
      return [toOverlayInput(pool, positionState)];
    });
  }, [positionStates, readySession]);
  const overlay = useMemo(
    () =>
      buildLiquidityOverlay({
        reference,
        pools: enabledInputs,
        totalPoolCount: readySession?.pools.length ?? 0,
        filter,
        valuationGeneration,
      }),
    [
      enabledInputs,
      filter,
      readySession?.pools.length,
      reference,
      valuationGeneration,
    ],
  );

  useEffect(() => {
    onOverlayChange?.(mint && readySession ? overlay : undefined);
  }, [mint, onOverlayChange, overlay, readySession]);

  const largestSignature = overlay.largestTargetKeys.join("|");
  useEffect(() => {
    if (
      filter.mode === "largest" &&
      overlay.completeDenominator &&
      filter.previousKeys.join("|") !== largestSignature
    ) {
      // Keep the last complete mask available while a later refresh is pending.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilter({ mode: "largest", previousKeys: overlay.largestTargetKeys });
    }
  }, [
    filter,
    largestSignature,
    overlay.completeDenominator,
    overlay.largestTargetKeys,
  ]);

  const reportPositionState = useCallback(
    (poolAddress: string, next: PoolPositionsState) => {
      setPositionStates((current) =>
        current[poolAddress] === next
          ? current
          : { ...current, [poolAddress]: next },
      );
    },
    [],
  );

  function togglePool(address: string) {
    setActivatedPools((current) => new Set(current).add(address));
    if (!readySession?.enabledAddresses.includes(address))
      setValuationGeneration((current) => current + 1);
    toggle(address);
  }

  function refreshEnabledPositions() {
    setValuationGeneration((current) => current + 1);
  }

  function applyMinimum() {
    const minimumUsd = parseMinimumUsd(minimumInput);
    if (!minimumUsd) {
      setMinimumError("Enter a non-negative USD amount.");
      return;
    }
    setMinimumError(undefined);
    setFilter({
      mode: "minimum",
      minimumUsd,
      input: minimumInput.trim() || "0",
    });
  }

  function showLargest() {
    if (!overlay.completeDenominator) return;
    setFilter({ mode: "largest", previousKeys: overlay.largestTargetKeys });
    setMinimumError(undefined);
  }

  function showAllValued() {
    setFilter({ mode: "all" });
    setShowAllRequest((current) => current + 1);
    setMinimumInput("");
    setMinimumError(undefined);
  }

  function clearFilter() {
    setFilter({ mode: "all" });
    setMinimumInput("");
    setMinimumError(undefined);
  }

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
          onToggle={togglePool}
          rpc={rpc}
          activatedPools={activatedPools}
          filter={filter}
          minimumInput={minimumInput}
          minimumError={minimumError}
          overlay={overlay}
          hoveredPositionKeys={hoveredPositionKeys}
          onMinimumInput={setMinimumInput}
          onApplyMinimum={applyMinimum}
          onShowLargest={showLargest}
          onShowAllValued={showAllValued}
          onClearFilter={clearFilter}
          onPositionState={reportPositionState}
          onRefreshPositions={refreshEnabledPositions}
          showAllRequest={showAllRequest}
          valuationGeneration={valuationGeneration}
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
  activatedPools,
  filter,
  minimumInput,
  minimumError,
  overlay,
  hoveredPositionKeys,
  onMinimumInput,
  onApplyMinimum,
  onShowLargest,
  onShowAllValued,
  onClearFilter,
  onPositionState,
  onRefreshPositions,
  showAllRequest,
  valuationGeneration,
}: {
  session: Extract<
    ReturnType<typeof useDlmmPools>["state"],
    { status: "ready" }
  >["session"];
  actionError?: string;
  onToggle: (address: string) => void;
  rpc: ReadOnlySolanaRpc;
  activatedPools: ReadonlySet<string>;
  filter: LiquidityFilter;
  minimumInput: string;
  minimumError?: string;
  overlay: LiquidityOverlayModel;
  hoveredPositionKeys: readonly string[];
  onMinimumInput: (value: string) => void;
  onApplyMinimum: () => void;
  onShowLargest: () => void;
  onShowAllValued: () => void;
  onClearFilter: () => void;
  onPositionState: (poolAddress: string, state: PoolPositionsState) => void;
  onRefreshPositions: () => void;
  showAllRequest: number;
  valuationGeneration: number;
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
      <GlobalPositionControls
        filter={filter}
        minimumInput={minimumInput}
        minimumError={minimumError}
        model={overlay}
        onMinimumInput={onMinimumInput}
        onApplyMinimum={onApplyMinimum}
        onShowLargest={onShowLargest}
        onShowAllValued={onShowAllValued}
        onClearFilter={onClearFilter}
      />
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
                {ready && (enabled || activatedPools.has(pool.address)) ? (
                  <div hidden={!enabled}>
                    <PoolPositions
                      key={pool.address}
                      pool={pool}
                      mint={session.mint}
                      minContextSlot={session.maximumSlot}
                      rpc={rpc}
                      enabled={enabled}
                      overlay={overlay}
                      hoveredPositionKeys={hoveredPositionKeys}
                      onStateChange={onPositionState}
                      onRefreshPositions={onRefreshPositions}
                      showAllRequest={showAllRequest}
                      valuationGeneration={valuationGeneration}
                    />
                  </div>
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

function GlobalPositionControls({
  filter,
  minimumInput,
  minimumError,
  model,
  onMinimumInput,
  onApplyMinimum,
  onShowLargest,
  onShowAllValued,
  onClearFilter,
}: {
  filter: LiquidityFilter;
  minimumInput: string;
  minimumError?: string;
  model: LiquidityOverlayModel;
  onMinimumInput: (value: string) => void;
  onApplyMinimum: () => void;
  onShowLargest: () => void;
  onShowAllValued: () => void;
  onClearFilter: () => void;
}) {
  return (
    <section
      className="global-position-controls"
      aria-label="Global position filters"
    >
      <div className="global-filter-heading">
        <div>
          <strong>Global position view</strong>
          <span>
            {model.shownCount.toLocaleString()} shown of{" "}
            {model.valuedCount.toLocaleString()} valued positions
          </span>
        </div>
        <span
          className={`status ${model.completeDenominator ? "connected" : ""}`}
        >
          {model.completeDenominator ? "Complete scope" : "Incomplete scope"}
        </span>
      </div>
      <form
        className="minimum-filter"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyMinimum();
        }}
      >
        <label htmlFor="minimum-position-usd">
          Minimum position value (USD)
        </label>
        <div className="field-row">
          <input
            id="minimum-position-usd"
            inputMode="decimal"
            placeholder="No minimum"
            value={minimumInput}
            aria-invalid={Boolean(minimumError)}
            aria-describedby={
              minimumError ? "minimum-position-error" : undefined
            }
            onChange={(event) => onMinimumInput(event.target.value)}
          />
          <button className="button-secondary" type="submit">
            Apply
          </button>
        </div>
        {minimumError ? (
          <span
            className="field-error"
            id="minimum-position-error"
            role="alert"
          >
            {minimumError}
          </span>
        ) : null}
      </form>
      <div className="position-actions global-filter-actions">
        <button
          className={filter.mode === "largest" ? "active" : "button-secondary"}
          type="button"
          disabled={!model.completeDenominator}
          title={
            model.completeDenominator
              ? "Show positions contributing about 80% of enabled-pool value"
              : "Every enabled pool needs a complete current valuation first"
          }
          onClick={onShowLargest}
        >
          Largest contributors
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={onShowAllValued}
        >
          Show all valued
        </button>
        {filter.mode !== "all" ? (
          <button
            className="button-secondary"
            type="button"
            onClick={onClearFilter}
          >
            Clear filter
          </button>
        ) : null}
      </div>
      <div className="global-filter-summary" role="status" aria-live="polite">
        <span>
          {model.selectedIncludedCount.toLocaleString()} selected and included ·{" "}
          {model.filteredValuePercent === undefined
            ? "covered value unknown"
            : `${model.filteredValuePercent.toFixed(1)}% of known value`}
        </span>
        <span>{model.scopeDetail}</span>
        {filter.mode === "minimum" ? (
          <span>Active minimum: ${filter.input || "0"}</span>
        ) : filter.mode === "largest" && !model.completeDenominator ? (
          <span>
            Prior contributor mask held while enabled-pool data refreshes.
          </span>
        ) : null}
      </div>
    </section>
  );
}

function PoolPositions({
  rpc,
  pool,
  mint,
  minContextSlot,
  enabled,
  overlay,
  hoveredPositionKeys,
  onStateChange,
  onRefreshPositions,
  showAllRequest,
  valuationGeneration,
}: {
  rpc: ReadOnlySolanaRpc;
  pool: DlmmPoolItem;
  mint: string;
  minContextSlot: number;
  enabled: boolean;
  overlay: LiquidityOverlayModel;
  hoveredPositionKeys: readonly string[];
  onStateChange: (poolAddress: string, state: PoolPositionsState) => void;
  onRefreshPositions: () => void;
  showAllRequest: number;
  valuationGeneration: number;
}) {
  const { state, cancel, restart, reveal, toggle } = usePoolPositions(
    rpc,
    pool,
    mint,
    minContextSlot,
    undefined,
    enabled,
    valuationGeneration,
  );
  const handledShowAllRequest = useRef(0);
  useEffect(() => {
    onStateChange(pool.address, state);
  }, [onStateChange, pool.address, state]);
  useEffect(() => {
    if (
      showAllRequest > handledShowAllRequest.current &&
      state.status === "ready"
    ) {
      handledShowAllRequest.current = showAllRequest;
      reveal("all");
    }
  }, [reveal, showAllRequest, state.status]);
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
  const poolPositions = overlay.positions.filter(
    ({ poolAddress }) => poolAddress === pool.address,
  );
  const globalByKey = new Map(poolPositions.map((item) => [item.key, item]));
  const eligiblePositionAddresses = poolPositions
    .filter(({ commonAxisAvailable }) => commonAxisAvailable)
    .map(({ position }) => position.address);
  const listUniverse =
    overlay.filterMode === "all" ? visible : session.positions;
  const valuedPositions = listUniverse.filter(
    (position) =>
      position.valueUsd &&
      overlay.filterKeys.has(
        positionOverlayKey(pool.address, position.address),
      ),
  );
  const unavailablePositions = listUniverse.filter(
    (position) => !position.valueUsd,
  );
  const loadedValue = visible.reduce<Rational>(
    (sum, position) =>
      position.valueUsd ? addRational(sum, position.valueUsd) : sum,
    { numerator: 0n, denominator: 1n },
  );
  const valuePercent =
    session.valueCoverage === "complete" && session.totalValueUsd
      ? rationalPercentage(loadedValue, session.totalValueUsd)
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
      {session.quoteObservedAt ? (
        <p className="pool-detail-note">
          USD quote observed{" "}
          {new Date(session.quoteObservedAt).toLocaleTimeString()} via
          GeckoTerminal
          {session.quotePriceUsdExact
            ? ` ($${session.quotePriceUsdExact})`
            : ""}
        </p>
      ) : null}
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
          onClick={onRefreshPositions}
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
        {valuedPositions.map((position) => {
          const key = positionOverlayKey(pool.address, position.address);
          const global = globalByKey.get(key);
          return (
            <label
              className={`position-row ${hoveredPositionKeys.includes(key) ? "hovered" : ""}`}
              key={position.address}
            >
              <input
                type="checkbox"
                checked={session.selectedAddresses.includes(position.address)}
                disabled={!global?.commonAxisAvailable}
                title={global?.unavailableReason}
                onChange={() =>
                  toggle(position.address, eligiblePositionAddresses)
                }
              />
              <span>
                <strong>{shortAddress(position.address)}</strong>
                <small>
                  bins {position.lowerBinId}–{position.upperBinId} · owner{" "}
                  {shortAddress(position.owner)}
                </small>
                <small>
                  {global?.commonAxisAvailable
                    ? `${formatAxisRange(global.axisMinimum, global.axisMaximum)} on ${overlayAxisLabel(overlay)}`
                    : (global?.unavailableReason ??
                      "Common-axis overlay unavailable.")}
                </small>
              </span>
              <span className="position-value">
                <b>{formatUsdMicros(position.valueUsdMicros)}</b>
                <small>
                  {position.valueUsd && overlay.totalValuedUsd?.numerator
                    ? `${rationalPercentage(position.valueUsd, overlay.totalValuedUsd)?.toFixed(2)}% known value`
                    : "Known share unavailable"}
                </small>
              </span>
            </label>
          );
        })}
        {unavailablePositions.length > 0 ? (
          <div className="unavailable-position-group">
            <strong>
              Unavailable values ({unavailablePositions.length.toLocaleString()}
              )
            </strong>
            {unavailablePositions.map((position) => {
              const key = positionOverlayKey(pool.address, position.address);
              const global = globalByKey.get(key);
              return (
                <div
                  className="position-row unavailable"
                  key={position.address}
                >
                  <input
                    aria-label={`Overlay unavailable for position ${position.address}`}
                    type="checkbox"
                    checked={session.selectedAddresses.includes(
                      position.address,
                    )}
                    disabled
                  />
                  <span>
                    <strong>{shortAddress(position.address)}</strong>
                    <small>
                      pool {shortAddress(pool.address)} · owner{" "}
                      {shortAddress(position.owner)}
                    </small>
                    <small>
                      {global?.unavailableReason ??
                        "A current USD value is unavailable."}
                    </small>
                  </span>
                  <b>Value unknown</b>
                </div>
              );
            })}
          </div>
        ) : null}
        {valuedPositions.length === 0 && unavailablePositions.length === 0 ? (
          <p className="pool-detail-note">
            No positions match the active global filter.
          </p>
        ) : null}
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

function toOverlayInput(
  pool: DlmmPoolItem,
  state: PoolPositionsState | undefined,
): PoolOverlayInput {
  if (!state) return { pool, state: "loading" };
  if (state.status === "ready")
    return {
      pool,
      state: state.refreshing ? "refreshing" : "ready",
      session: state.session,
    };
  return { pool, state: state.status };
}

function formatAxisRange(minimum?: number, maximum?: number): string {
  if (minimum === undefined || maximum === undefined)
    return "Common-axis range unavailable";
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

function overlayAxisLabel(model: LiquidityOverlayModel): string {
  return model.axisLabel ?? "the unavailable reference axis";
}
