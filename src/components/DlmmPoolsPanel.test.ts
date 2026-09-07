import { describe, expect, it } from "vitest";
import type { DlmmPoolsState } from "../app/useDlmmPools";
import type { PoolPositionsState } from "../app/usePoolPositions";
import type { LiquidityOverlayModel } from "../domain/liquidityOverlay";
import { describePanelStatus } from "./positionsPanelStatus";

const overlay = {
  selectedIncludedCount: 1,
  valuedCount: 1,
  filteredValuePercent: 100,
  refreshingPoolCount: 0,
  completeDenominator: true,
} as LiquidityOverlayModel;

function poolState(disabledQuoteStale = false): DlmmPoolsState {
  return {
    status: "ready",
    refreshing: false,
    session: {
      enabledAddresses: ["enabled"],
      pools: [
        { address: "enabled", quoteStale: false },
        { address: "disabled", quoteStale: disabledQuoteStale },
      ],
      rpcStale: false,
      metadataStale: false,
      quoteStale: disabledQuoteStale,
    },
  } as unknown as DlmmPoolsState;
}

function ready(stale: boolean): PoolPositionsState {
  return {
    status: "ready",
    refreshing: false,
    session: { stale },
  } as unknown as PoolPositionsState;
}

describe("compact enabled-pool status", () => {
  it.each([
    ["stale", ready(true), "Positions stale"],
    ["error", { status: "error", message: "failed" }, "Positions unavailable"],
    [
      "cancelled",
      {
        status: "cancelled",
        progress: { discovered: 1, hydrated: 0, requests: 1, bytes: 0 },
      },
      "Positions cancelled",
    ],
  ] as const)(
    "ignores a disabled %s session and restores it when enabled",
    (_kind, disabledState, expectedEnabledLabel) => {
      const positions = {
        enabled: ready(false),
        disabled: disabledState as PoolPositionsState,
      };
      expect(
        describePanelStatus(poolState(), overlay, positions, ["enabled"]).label,
      ).toBe("Positions current");
      expect(
        describePanelStatus(poolState(), overlay, positions, [
          "enabled",
          "disabled",
        ]).label,
      ).toBe(expectedEnabledLabel);
    },
  );

  it("ignores a disabled stale quote and restores it when enabled", () => {
    const state = poolState(true);
    const positions = { enabled: ready(false), disabled: ready(false) };
    expect(
      describePanelStatus(state, overlay, positions, ["enabled"]).label,
    ).toBe("Positions current");
    expect(
      describePanelStatus(state, overlay, positions, ["enabled", "disabled"])
        .label,
    ).toBe("Positions stale");
  });
});
