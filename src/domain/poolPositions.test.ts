import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPositionRpcSnapshot } from "../providers/positionRpc";
import { rankPositions } from "../workers/positionWorker";
import {
  loadPoolPositionSession,
  revealPositions,
  togglePositionSelection,
  type PoolPositionSession,
} from "./poolPositions";

vi.mock("../providers/positionRpc", () => ({
  loadPositionRpcSnapshot: vi.fn(),
}));
vi.mock("../workers/positionWorker", () => ({ rankPositions: vi.fn() }));

const loadRpc = vi.mocked(loadPositionRpcSnapshot);
const rank = vi.mocked(rankPositions);

describe("progressive position selection", () => {
  beforeEach(() => {
    loadRpc.mockReset();
    rank.mockReset();
  });
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

  it("bypasses a prior pool quote during refresh and publishes fresh provenance", async () => {
    loadRpc.mockResolvedValue({
      positionAccounts: [],
      binArrayData: [],
      discoveredCount: 0,
      completePositionSet: true,
      quoteDecimals: 6,
      minimumSlot: 20,
      maximumSlot: 21,
      requests: 3,
      bytes: 0,
    });
    rank.mockResolvedValue({
      positions: [],
      totalValueUsd: { numerator: 0n, denominator: 1n },
      totalValueUsdMicros: 0n,
      valueCoverage: "complete",
      missingBinIds: [],
    });
    const getQuotePrices = vi.fn().mockResolvedValue(
      new Map([
        [
          "quote",
          {
            mint: "quote",
            priceUsd: 2,
            priceUsdExact: "2.0000004",
            observedAt: 200,
          },
        ],
      ]),
    );
    const pool = {
      address: "pool",
      discovery: {
        address: "pool",
        discoveredAs: ["x" as const],
        decodeState: "ready" as const,
        tokenXMint: "mint",
        tokenYMint: "quote",
        reserveX: "x",
        reserveY: "y",
        activeId: 7,
        binStep: 100,
        status: 0,
      },
      qualification: "qualified" as const,
      qualificationDetail: "fixture",
      quotePrice: {
        mint: "quote",
        priceUsd: 1,
        priceUsdExact: "1",
        observedAt: 100,
      },
    };
    const result = await loadPoolPositionSession(
      {} as Parameters<typeof loadPoolPositionSession>[0],
      { getQuotePrices } as unknown as Parameters<
        typeof loadPoolPositionSession
      >[1],
      pool,
      "mint",
      12,
      new AbortController().signal,
      undefined,
      true,
    );

    expect(getQuotePrices).toHaveBeenCalledOnce();
    expect(getQuotePrices.mock.calls[0]?.[0]).toEqual(["quote"]);
    expect(getQuotePrices.mock.calls[0]?.[1]).toMatchObject({
      priority: "user",
      fresh: true,
    });
    const quoteOptions = getQuotePrices.mock.calls[0]?.[1] as
      { signal?: AbortSignal } | undefined;
    expect(quoteOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(rank.mock.calls[0]?.[0]).toMatchObject({
      activeBinId: 7,
      quotePriceUsdExact: "2.0000004",
    });
    expect(rank.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({
      quoteMint: "quote",
      quotePriceUsdExact: "2.0000004",
      quoteObservedAt: 200,
    });
    expect(typeof result.observedAt).toBe("number");
  });
});

function fixtureSession(): PoolPositionSession {
  const positions = Array.from({ length: 230 }, (_, index) => ({
    address: String(index),
    owner: "owner",
    lowerBinId: 0,
    upperBinId: 0,
    valueUsdMicros: 1n,
    valueUsd: { numerator: 1n, denominator: 1n },
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
    totalValueUsd: { numerator: 230n, denominator: 1n },
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
