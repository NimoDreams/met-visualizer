import type { DlmmPoolsState } from "../app/useDlmmPools";
import type { PoolPositionsState } from "../app/usePoolPositions";
import type { LiquidityOverlayModel } from "../domain/liquidityOverlay";

export type PositionsPanelStatus = {
  state:
    | "idle"
    | "loading"
    | "current"
    | "incomplete"
    | "stale"
    | "cancelled"
    | "error";
  label: string;
  selectedIncluded: number;
  valued: number;
  coverage?: number;
};

export function describePanelStatus(
  state: DlmmPoolsState,
  overlay: LiquidityOverlayModel,
  positions: Record<string, PoolPositionsState>,
  enabledAddresses: readonly string[],
): PositionsPanelStatus {
  const shared = {
    selectedIncluded: overlay.selectedIncludedCount,
    valued: overlay.valuedCount,
    coverage: overlay.filteredValuePercent,
  };
  if (state.status === "idle")
    return { state: "idle", label: "Positions waiting", ...shared };
  if (state.status === "loading")
    return { state: "loading", label: "Pools loading", ...shared };
  if (state.status === "error")
    return { state: "error", label: "Pools unavailable", ...shared };
  const positionStates = enabledAddresses.flatMap((address) => {
    const positionState = positions[address];
    return positionState ? [positionState] : [];
  });
  const enabled = new Set(enabledAddresses);
  const quoteStale = state.session.pools.some(
    (pool) => enabled.has(pool.address) && pool.quoteStale,
  );
  const sessionStale = positionStates.some(
    (positionState) =>
      positionState.status === "ready" && positionState.session.stale,
  );
  if (
    state.session.rpcStale ||
    state.session.metadataStale ||
    quoteStale ||
    sessionStale
  )
    return { state: "stale", label: "Positions stale", ...shared };
  if (state.refreshing || overlay.refreshingPoolCount > 0)
    return { state: "loading", label: "Positions loading", ...shared };
  if (positionStates.some(({ status }) => status === "error"))
    return { state: "error", label: "Positions unavailable", ...shared };
  if (positionStates.some(({ status }) => status === "cancelled"))
    return { state: "cancelled", label: "Positions cancelled", ...shared };
  return overlay.completeDenominator
    ? { state: "current", label: "Positions current", ...shared }
    : { state: "incomplete", label: "Positions incomplete", ...shared };
}
