import { describe, expect, it } from "vitest";
import {
  revealPositions,
  togglePositionSelection,
  type PoolPositionSession,
} from "./poolPositions";

describe("progressive position selection", () => {
  it("selects later batches until the first manual position change", () => {
    let session = fixtureSession();
    session = revealPositions(session, "next");
    expect(session.visibleCount).toBe(125);
    expect(session.selectedAddresses).toHaveLength(125);

    session = togglePositionSelection(session, "0");
    session = revealPositions(session, "all");
    expect(session.visibleCount).toBe(230);
    expect(session.selectedAddresses).toHaveLength(124);
    expect(session.selectedAddresses).not.toContain("0");
    expect(session.selectedAddresses).not.toContain("229");
  });
});

function fixtureSession(): PoolPositionSession {
  const positions = Array.from({ length: 230 }, (_, index) => ({
    address: String(index),
    owner: "owner",
    lowerBinId: 0,
    upperBinId: 0,
    valueUsdMicros: 1n,
    valuedBins: 1,
    nonzeroBins: 1,
    contributions: [],
  }));
  return {
    poolAddress: "pool",
    positions,
    visibleCount: 25,
    selectedAddresses: positions.slice(0, 25).map(({ address }) => address),
    manualSelection: false,
    discoveredCount: positions.length,
    valueCoverage: "complete",
    totalValueUsdMicros: 230n,
    missingBinCount: 0,
    binArrayCount: 2,
    minimumSlot: 1,
    maximumSlot: 2,
    requests: 5,
    bytes: 100,
    elapsedMs: 10,
    observedAt: 1,
    stale: false,
    loadingMode: "portable-batched",
    detail: "complete",
  };
}
