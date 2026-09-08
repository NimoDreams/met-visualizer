import { describe, expect, it } from "vitest";
import type { DlmmPoolItem } from "./dlmmPools";
import {
  buildLiquidityOverlay,
  parseMinimumUsd,
  positionOverlayKey,
  type PoolOverlayInput,
} from "./liquidityOverlay";
import type { PoolPositionSession } from "./poolPositions";
import type { ValuedPosition } from "./positionValuation";
import type { ReferenceMarketSession } from "./referenceMarket";
import { resolveValuationBasis } from "./referenceMarket";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";

const Q64 = 1n << 64n;
const mint = "So11111111111111111111111111111111111111112";

describe("global liquidity overlay", () => {
  it("normalizes both pool orientations to one axis and aggregates each contribution once", () => {
    const pools = [
      poolInput("pool-a", "y", "1", Q64, [position("a", 60n, 60_000_000n, 0n)]),
      poolInput("pool-b", "x", "4", 4n * Q64, [
        position("b", 25n, 0n, 25_000_000n),
      ]),
    ];
    const model = buildLiquidityOverlay({
      reference: reference(),
      pools,
      totalPoolCount: 3,
      valuationGeneration: 1,
      filter: { mode: "all" },
    });

    expect(model.completeDenominator).toBe(true);
    expect(model.levels).toHaveLength(1);
    expect(model.levels[0]).toMatchObject({
      axisPrice: 2_000,
      valueUsd: { numerator: 85n, denominator: 1n },
    });
    expect(model.levels[0]?.contributions).toHaveLength(2);
    expect(
      new Set(model.levels[0]?.contributions.map(({ id }) => id)).size,
    ).toBe(2);
    expect(model.unopenedPoolCount).toBe(1);
  });

  it("applies exact global minimum and complete-denominator 80% masks without changing selection", () => {
    const pools = [
      poolInput("pool-a", "y", "1", Q64, [
        position("a", 60n, 60_000_000n, 0n),
        position("c", 15n, 15_000_000n, 0n),
      ]),
      poolInput("pool-b", "x", "4", 4n * Q64, [
        position("b", 25n, 0n, 25_000_000n),
      ]),
    ];
    const all = buildLiquidityOverlay({
      reference: reference(),
      pools,
      totalPoolCount: 2,
      valuationGeneration: 1,
      filter: { mode: "all" },
    });
    expect(all.largestTargetKeys).toEqual([
      positionOverlayKey("pool-a", "a"),
      positionOverlayKey("pool-b", "b"),
    ]);

    const largest = buildLiquidityOverlay({
      reference: reference(),
      pools,
      totalPoolCount: 2,
      valuationGeneration: 1,
      filter: { mode: "largest", previousKeys: all.largestTargetKeys },
    });
    expect(largest.filteredCount).toBe(2);
    expect(largest.filteredValuePercent).toBe(85);
    expect(largest.selectedIncludedCount).toBe(3 - 1);

    const minimum = parseMinimumUsd("25.0000000001");
    expect(minimum).toBeDefined();
    const threshold = buildLiquidityOverlay({
      reference: reference(),
      pools,
      totalPoolCount: 2,
      valuationGeneration: 1,
      filter: { mode: "minimum", minimumUsd: minimum!, input: "25.0000000001" },
    });
    expect([...threshold.filterKeys]).toEqual([
      positionOverlayKey("pool-a", "a"),
    ]);
    expect(pools[0]?.session?.selectedAddresses).toEqual(["a", "c"]);
  });

  it("retains a prior contributor mask but disables recomputation while scope is incomplete", () => {
    const ready = poolInput("pool-a", "y", "1", Q64, [
      position("a", 60n, 60_000_000n, 0n),
      position("b", 40n, 40_000_000n, 0n),
    ]);
    const previousKeys = [positionOverlayKey("pool-a", "a")];
    const model = buildLiquidityOverlay({
      reference: reference(),
      pools: [{ ...ready, state: "refreshing" }],
      totalPoolCount: 1,
      valuationGeneration: 1,
      filter: { mode: "largest", previousKeys },
    });
    expect(model.completeDenominator).toBe(false);
    expect([...model.filterKeys]).toEqual(previousKeys);
    expect(model.scopeDetail).toMatch(/denominator is incomplete/i);
  });

  it("requires every enabled pool to publish the coordinator valuation generation", () => {
    const first = poolInput("pool-a", "y", "1", Q64, [
      position("a", 60n, 60_000_000n, 0n),
    ]);
    const second = poolInput("pool-b", "y", "1", Q64, [
      position("b", 40n, 40_000_000n, 0n),
    ]);
    second.session!.valuationGeneration = 2;
    const model = (pools: PoolOverlayInput[]) =>
      buildLiquidityOverlay({
        reference: reference(),
        pools,
        totalPoolCount: 2,
        valuationGeneration: 2,
        filter: { mode: "all" },
      });

    const mismatched = model([first, second]);
    expect(mismatched.completeDenominator).toBe(false);
    expect(mismatched.scopeDetail).toMatch(/coordinated valuation generation/i);
    first.session!.valuationGeneration = 2;
    expect(model([first, second]).completeDenominator).toBe(true);
    expect(
      model([{ ...first, state: "refreshing" }, second]).completeDenominator,
    ).toBe(false);
    expect(
      model([{ pool: first.pool, state: "cancelled" }, second])
        .completeDenominator,
    ).toBe(false);
    expect(
      model([{ pool: first.pool, state: "error" }, second]).completeDenominator,
    ).toBe(false);
  });

  it("keeps unavailable values visible in scope and out of overlay/filter denominators", () => {
    const unavailable = position("unknown", 0n, 1n, 1n);
    unavailable.valueUsd = undefined;
    unavailable.valueUsdMicros = undefined;
    const pool = poolInput("pool-a", "y", "1", Q64, [unavailable]);
    pool.session!.valueCoverage = "unknown";
    const model = buildLiquidityOverlay({
      reference: reference(),
      pools: [pool],
      totalPoolCount: 1,
      valuationGeneration: 1,
      filter: { mode: "all" },
    });
    expect(model.unavailableCount).toBe(1);
    expect(model.valuedCount).toBe(0);
    expect(model.levels).toEqual([]);
    expect(model.completeDenominator).toBe(false);
    expect(model.positions[0]?.unavailableReason).toMatch(/current USD value/i);
  });

  it("apportions bins without drifting from the reviewed per-position value", () => {
    const rounded = position("rounded", 1n, 1n, 0n);
    rounded.contributions = [
      { binId: 0, amountX: 1n, amountY: 0n, priceQ64: Q64 },
      { binId: 1, amountX: 1n, amountY: 0n, priceQ64: 2n * Q64 },
    ];
    const model = buildLiquidityOverlay({
      reference: reference(),
      pools: [poolInput("pool-a", "y", "1", Q64 / 2n, [rounded])],
      totalPoolCount: 1,
      valuationGeneration: 1,
      filter: { mode: "all" },
    });
    const aggregate = model.levels.reduce(
      (sum, level) => ({
        numerator:
          sum.numerator * level.valueUsd.denominator +
          level.valueUsd.numerator * sum.denominator,
        denominator: sum.denominator * level.valueUsd.denominator,
      }),
      { numerator: 0n, denominator: 1n },
    );

    expect(model.levels).toHaveLength(2);
    expect(aggregate.numerator * 1n).toBe(aggregate.denominator);
  });

  it("keeps a smaller quote-X memecoin fixture on the reference axis", () => {
    const positions = Array.from({ length: 37 }, (_, index) =>
      position(String(index), BigInt(index + 1), 0n, 1_000_000n),
    );
    const model = buildLiquidityOverlay({
      reference: reference(),
      pools: [poolInput("pool-meme", "x", "2", 2n * Q64, positions)],
      totalPoolCount: 1,
      valuationGeneration: 1,
      filter: { mode: "all" },
    });

    expect(model.positions).toHaveLength(37);
    expect(model.levels).toHaveLength(1);
    expect(model.levels[0]?.axisPrice).toBe(1_000);
    expect(model.completeDenominator).toBe(true);
  });

  it("carries accepted derived supply values through common-axis normalization", async () => {
    const baseReference = reference();
    const rpc = {
      getTokenSupply: () =>
        Promise.resolve({
          value: { amount: "18446744073709551615", decimals: 255 },
        }),
    } as unknown as ReadOnlySolanaRpc;
    const tinyBasis = await resolveValuationBasis(
      baseReference.token,
      rpc,
      mint,
      new AbortController().signal,
    );
    expect(tinyBasis.kind).toBe("fdv");
    expect(tinyBasis.displaySupply).toBeGreaterThan(0);

    for (const basis of [
      tinyBasis,
      await resolveValuationBasis(
        {
          ...baseReference.token,
          priceUsd: 1e-100,
          marketCapUsd: 1e100,
        },
        undefined,
        mint,
        new AbortController().signal,
      ),
    ]) {
      const model = buildLiquidityOverlay({
        reference: { ...baseReference, basis },
        pools: [
          poolInput("pool-derived", "y", "1", Q64, [
            position("position", 1n, 1_000_000n, 0n),
          ]),
        ],
        totalPoolCount: 1,
        valuationGeneration: 1,
        filter: { mode: "all" },
      });
      expect(model.levels).toHaveLength(1);
      expect(model.levels[0]?.axisPrice).toBeGreaterThan(0);
      expect(Number.isFinite(model.levels[0]?.axisPrice)).toBe(true);
    }
  });

  it("aggregates a dense 1,800-position distribution within the UI budget", () => {
    const positions = Array.from({ length: 1_800 }, (_, index) => ({
      ...position(String(index), 1n, 1_000_000n, 0n),
      contributions: Array.from({ length: 4 }, (__, binIndex) => ({
        binId: index * 4 + binIndex,
        amountX: 250_000n,
        amountY: 0n,
        priceQ64: Q64 + BigInt(index * 4 + binIndex) * 1_000_000n,
      })),
    }));
    const startedAt = performance.now();
    const model = buildLiquidityOverlay({
      reference: reference(),
      pools: [poolInput("pool-a", "y", "1", Q64, positions)],
      totalPoolCount: 1,
      valuationGeneration: 1,
      filter: { mode: "all" },
    });
    expect(model.positions).toHaveLength(1_800);
    expect(model.levels).toHaveLength(7_200);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});

function position(
  address: string,
  value: bigint,
  amountX: bigint,
  amountY: bigint,
): ValuedPosition {
  return {
    address,
    owner: "owner",
    lowerBinId: 0,
    upperBinId: 0,
    valueUsd: { numerator: value, denominator: 1n },
    valueUsdMicros: value * 1_000_000n,
    valuedBins: 1,
    nonzeroBins: 1,
    contributions: [{ binId: 0, amountX, amountY, priceQ64: 2n * Q64 }],
  };
}

function poolInput(
  address: string,
  quoteSide: "x" | "y",
  quotePriceUsdExact: string,
  currentPriceQ64: bigint,
  positions: ValuedPosition[],
): PoolOverlayInput {
  const tokenX = quoteSide === "y" ? mint : "quote";
  const tokenY = quoteSide === "y" ? "quote" : mint;
  const pool: DlmmPoolItem = {
    address,
    discovery: {
      address,
      discoveredAs: [quoteSide === "y" ? "x" : "y"],
      decodeState: "ready",
      tokenXMint: tokenX,
      tokenYMint: tokenY,
      reserveX: "reserve-x",
      reserveY: "reserve-y",
      activeId: 0,
      binStep: 100,
      status: 0,
    },
    qualification: "qualified",
    qualificationDetail: "fixture",
  };
  const session: PoolPositionSession = {
    poolAddress: address,
    valuationGeneration: 1,
    enteredMint: mint,
    positions,
    visibleCount: positions.length,
    selectedAddresses: positions.map(
      ({ address: positionAddress }) => positionAddress,
    ),
    manualSelection: false,
    discoveredCount: positions.length,
    valueCoverage: "complete",
    totalValueUsd: {
      numerator: positions.reduce(
        (sum, item) => sum + (item.valueUsd?.numerator ?? 0n),
        0n,
      ),
      denominator: 1n,
    },
    totalValueUsdMicros: positions.reduce(
      (sum, item) => sum + (item.valueUsdMicros ?? 0n),
      0n,
    ),
    missingBinCount: 0,
    binArrayCount: 1,
    minimumSlot: 1,
    maximumSlot: 1,
    requests: 1,
    bytes: 1,
    elapsedMs: 1,
    observedAt: 1,
    quoteMint: "quote",
    quotePriceUsdExact,
    quoteObservedAt: 1,
    quoteSide,
    quoteDecimals: 6,
    currentPriceQ64,
    stale: false,
    loadingMode: "portable-batched",
    detail: "fixture",
  };
  return { pool, state: "ready", session };
}

function reference(): ReferenceMarketSession {
  return {
    mint,
    token: {
      address: mint,
      name: "Token",
      symbol: "TKN",
      decimals: 6,
      observedAt: 1,
    },
    basis: {
      kind: "fdv",
      label: "FDV (USD)",
      source: "current Solana mint supply",
      displaySupply: 1_000,
      observedAt: 1,
    },
    candidates: [],
    market: {
      address: "reference",
      name: "TKN / USD",
      dexId: "fixture",
      baseMint: mint,
      quoteMint: "usd",
      tokenSide: "base",
    },
    candles: [],
    interval: "15m",
    limitedHistory: false,
    freshness: { state: "current", detail: "fixture" },
    rejected: [],
    observedAt: 1,
  };
}
