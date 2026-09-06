import { describe, expect, it } from "vitest";
import positionOracle from "../test/fixtures/positionOracle.json";
import {
  decodeBinArrayAccount,
  decodePositionV2Account,
} from "./meteoraAccounts";
import {
  initialPositionCount,
  prepareAndRankPositionAccounts,
  valueAndRankPositions,
} from "./positionValuation";

describe("exact PositionV2 valuation", () => {
  it("uses every base and extension share with integer floor arithmetic", () => {
    const position = decodePositionV2Account(
      positionOracle.positionData,
      positionOracle.pool,
    );
    const bins = positionOracle.binArrayData.flatMap(
      (data) => decodeBinArrayAccount(data, positionOracle.pool).bins,
    );
    const result = valueAndRankPositions({
      positions: [{ address: "position", ...position }],
      bins,
      quoteSide: "y",
      quotePriceUsd: 2,
      quoteDecimals: 0,
      completePositionSet: true,
    });

    expect(result).toMatchObject({
      valueCoverage: "complete",
      totalValueUsdMicros: 4_472_000_000n,
      missingBinIds: [],
    });
    expect(result.positions[0]).toMatchObject({
      valueUsdMicros: 4_472_000_000n,
      nonzeroBins: 4,
      valuedBins: 4,
    });

    const inverted = valueAndRankPositions({
      positions: [{ address: "position", ...position }],
      bins,
      quoteSide: "x",
      quotePriceUsd: 2,
      quoteDecimals: 0,
      completePositionSet: true,
    });
    expect(inverted.totalValueUsdMicros).toBe(2_136_000_000n);
  });

  it("does not publish a complete denominator when an account or bin is missing", () => {
    const position = decodePositionV2Account(positionOracle.positionData);
    const result = valueAndRankPositions({
      positions: [{ address: "position", ...position }],
      bins: [],
      quoteSide: "y",
      quotePriceUsd: 2,
      quoteDecimals: 0,
      completePositionSet: false,
    });
    expect(result.valueCoverage).toBe("unknown");
    expect(result.totalValueUsdMicros).toBeUndefined();
    expect(result.missingBinIds).toEqual([0, 1, 69, 70]);
  });

  it("keeps native bin contributions while USD conversion is unavailable", () => {
    const result = prepareAndRankPositionAccounts({
      poolAddress: positionOracle.pool,
      positionAccounts: [
        { address: "position", data: positionOracle.positionData },
      ],
      binArrayData: positionOracle.binArrayData,
      quoteSide: "y",
      quoteDecimals: 9,
      completePositionSet: true,
    });
    expect(result.valueCoverage).toBe("unknown");
    expect(result.totalValueUsdMicros).toBeUndefined();
    expect(result.positions[0]?.valueUsdMicros).toBeUndefined();
    expect(result.positions[0]?.contributions).toHaveLength(4);
  });

  it("loads a representative newer-memecoin pool shape completely", () => {
    const result = prepareAndRankPositionAccounts({
      poolAddress: positionOracle.pool,
      positionAccounts: Array.from({ length: 37 }, (_, index) => ({
        address: `ansem-position-${index.toString().padStart(2, "0")}`,
        data: positionOracle.positionData,
      })),
      binArrayData: positionOracle.binArrayData,
      quoteSide: "y",
      quotePriceUsd: 150,
      quoteDecimals: 9,
      completePositionSet: true,
    });
    expect(result.positions).toHaveLength(37);
    expect(result.valueCoverage).toBe("complete");
    expect(initialPositionCount(result)).toBe(37);
    expect(result.positions[0]?.address).toBe("ansem-position-00");
  });

  it("prepares and ranks the 1,800-position JUP scale shape within the worker budget", () => {
    const startedAt = performance.now();
    const result = prepareAndRankPositionAccounts({
      poolAddress: positionOracle.pool,
      positionAccounts: Array.from({ length: 1_800 }, (_, index) => ({
        address: `jup-position-${index.toString().padStart(4, "0")}`,
        data: positionOracle.positionData,
      })),
      binArrayData: positionOracle.binArrayData,
      quoteSide: "y",
      quotePriceUsd: 150,
      quoteDecimals: 9,
      completePositionSet: true,
    });
    expect(result.positions).toHaveLength(1_800);
    expect(result.valueCoverage).toBe("complete");
    expect(initialPositionCount(result)).toBe(100);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it("loads at least 25, targets 80%, and caps the initial large-pool view at 100", () => {
    const positions = Array.from({ length: 150 }, (_, index) => ({
      address: String(index),
      owner: "owner",
      lowerBinId: 0,
      upperBinId: 0,
      valueUsdMicros: index < 25 ? 40n : 1n,
      valuedBins: 1,
      nonzeroBins: 1,
      contributions: [],
    }));
    const total = positions.reduce(
      (sum, position) => sum + position.valueUsdMicros,
      0n,
    );
    expect(
      initialPositionCount({
        positions,
        totalValueUsdMicros: total,
        valueCoverage: "complete",
        missingBinIds: [],
      }),
    ).toBe(25);
    expect(
      initialPositionCount({
        positions: positions.map((position) => ({
          ...position,
          valueUsdMicros: 1n,
        })),
        totalValueUsdMicros: 150n,
        valueCoverage: "complete",
        missingBinIds: [],
      }),
    ).toBe(100);
  });
});
