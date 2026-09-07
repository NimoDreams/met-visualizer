import { describe, expect, it } from "vitest";
import positionOracle from "../test/fixtures/positionOracle.json";
import {
  decodeBinArrayAccount,
  decodePositionV2Account,
  type DecodedBin,
} from "./meteoraAccounts";
import {
  initialPositionCount,
  parsePositiveDecimal,
  prepareAndRankPositionAccounts,
  valueAndRankPositions,
  type Rational,
  type ValuedPosition,
} from "./positionValuation";

const currentPriceQ64 = BigInt(
  positionOracle.expected.currentValuation.currentPriceQ64,
);

describe("exact PositionV2 valuation", () => {
  it("matches official SDK-derived principal and values it at one current pool price", () => {
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
      currentPriceQ64,
      quoteSide: "y",
      quotePriceUsdExact:
        positionOracle.expected.currentValuation.quoteY.quotePriceUsd,
      quoteDecimals:
        positionOracle.expected.currentValuation.quoteY.quoteDecimals,
      completePositionSet: true,
    });

    expect(result).toMatchObject({
      valueCoverage: "complete",
      totalValueUsd: rationalFromOracle("quoteY"),
      totalValueUsdMicros: BigInt(
        positionOracle.expected.currentValuation.quoteY.valueUsdMicros,
      ),
      missingBinIds: [],
    });
    expect(result.positions[0]).toMatchObject({
      valueUsd: rationalFromOracle("quoteY"),
      nonzeroBins: 4,
      valuedBins: 4,
      contributions: positionOracle.expected.sdkPosition.nonzeroBins.map(
        ({ binId, positionXAmount, positionYAmount }) => ({
          binId,
          amountX: BigInt(positionXAmount),
          amountY: BigInt(positionYAmount),
        }),
      ),
    });
    expect(
      result.positions[0]?.contributions.reduce(
        (sum, bin) => sum + bin.amountX,
        0n,
      ),
    ).toBe(BigInt(positionOracle.expected.sdkPosition.totalXAmount));
    expect(
      result.positions[0]?.contributions.reduce(
        (sum, bin) => sum + bin.amountY,
        0n,
      ),
    ).toBe(BigInt(positionOracle.expected.sdkPosition.totalYAmount));

    const inverted = valueAndRankPositions({
      positions: [{ address: "position", ...position }],
      bins,
      currentPriceQ64,
      quoteSide: "x",
      quotePriceUsdExact:
        positionOracle.expected.currentValuation.quoteX.quotePriceUsd,
      quoteDecimals:
        positionOracle.expected.currentValuation.quoteX.quoteDecimals,
      completePositionSet: true,
    });
    expect(inverted.totalValueUsd).toEqual(rationalFromOracle("quoteX"));
    expect(inverted.totalValueUsdMicros).toBe(
      BigInt(positionOracle.expected.currentValuation.quoteX.valueUsdMicros),
    );
  });

  it("does not use future range-bin prices to value current principal", () => {
    const result = valueAndRankPositions({
      positions: [position("lower", 0, [100n]), position("upper", 1, [100n])],
      bins: [bin(0, 1n << 64n, 100n, 0n), bin(1, 20n << 64n, 100n, 0n)],
      currentPriceQ64: 2n << 64n,
      quoteSide: "y",
      quotePriceUsdExact: "1",
      quoteDecimals: 0,
      completePositionSet: true,
    });
    expect(result.positions.map(({ valueUsd }) => valueUsd)).toEqual([
      { numerator: 200n, denominator: 1n },
      { numerator: 200n, denominator: 1n },
    ]);
  });

  it("preserves tiny quote precision through quantity multiplication", () => {
    const result = valueAndRankPositions({
      positions: Array.from({ length: 150 }, (_, index) =>
        position(`position-${index.toString().padStart(3, "0")}`, 0, [100n]),
      ),
      bins: [bin(0, 1n << 64n, 100_000_000n, 0n)],
      currentPriceQ64: 1n << 64n,
      quoteSide: "x",
      quotePriceUsdExact: "0.0000004",
      quoteDecimals: 0,
      completePositionSet: true,
    });
    expect(result.positions[0]?.valueUsd).toEqual({
      numerator: 40n,
      denominator: 1n,
    });
    expect(result.totalValueUsd).toEqual({
      numerator: 6_000n,
      denominator: 1n,
    });
    expect(initialPositionCount(result)).toBe(100);
  });

  it("does not publish a complete denominator when an account, bin, price, or quote is missing", () => {
    const position = decodePositionV2Account(positionOracle.positionData);
    const result = valueAndRankPositions({
      positions: [{ address: "position", ...position }],
      bins: [],
      quoteSide: "y",
      quotePriceUsdExact: "2",
      quoteDecimals: 0,
      completePositionSet: false,
    });
    expect(result.valueCoverage).toBe("unknown");
    expect(result.totalValueUsd).toBeUndefined();
    expect(result.missingBinIds).toEqual([0, 1, 69, 70]);
  });

  it("keeps native bin contributions while USD conversion is unavailable", () => {
    const result = prepareAndRankPositionAccounts({
      poolAddress: positionOracle.pool,
      positionAccounts: [
        { address: "position", data: positionOracle.positionData },
      ],
      binArrayData: positionOracle.binArrayData,
      activeBinId: 0,
      quoteSide: "y",
      quoteDecimals: 9,
      completePositionSet: true,
    });
    expect(result.valueCoverage).toBe("unknown");
    expect(result.totalValueUsd).toBeUndefined();
    expect(result.positions[0]?.valueUsd).toBeUndefined();
    expect(result.positions[0]?.contributions).toHaveLength(4);
  });

  it("loads a representative newer-memecoin pool shape completely", () => {
    const result = prepareAndRankPositionAccounts({
      poolAddress: positionOracle.pool,
      positionAccounts: Array.from({ length: 37 }, (_, index) => ({
        address: "ansem-position-" + index.toString().padStart(2, "0"),
        data: positionOracle.positionData,
      })),
      binArrayData: positionOracle.binArrayData,
      activeBinId: 0,
      quoteSide: "y",
      quotePriceUsdExact: "150",
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
        address: "jup-position-" + index.toString().padStart(4, "0"),
        data: positionOracle.positionData,
      })),
      binArrayData: positionOracle.binArrayData,
      activeBinId: 0,
      quoteSide: "y",
      quotePriceUsdExact: "150",
      quoteDecimals: 9,
      completePositionSet: true,
    });
    expect(result.positions).toHaveLength(1_800);
    expect(result.valueCoverage).toBe("complete");
    expect(initialPositionCount(result)).toBe(100);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it("loads at least 25, targets exact 80%, and caps the initial large-pool view at 100", () => {
    const positions = Array.from({ length: 150 }, (_, index) =>
      valuedPosition(String(index), index < 25 ? 40n : 1n),
    );
    expect(initialPositionCount(resultFor(positions))).toBe(25);
    expect(
      initialPositionCount(
        resultFor(
          positions.map((item) => ({ ...item, valueUsd: rational(1n) })),
        ),
      ),
    ).toBe(100);
  });

  it("bounds exact quote parsing before BigInt or exponent work", () => {
    const coefficient = "9".repeat(96);
    expect(
      parsePositiveDecimal(`${coefficient}e-100`).numerator,
    ).toBeGreaterThan(0n);
    for (const value of [
      "9".repeat(97),
      "1e101",
      "1e-101",
      `1.${"0".repeat(128)}`,
    ]) {
      expect(() => parsePositiveDecimal(value)).toThrow(
        /supported decimal range/i,
      );
    }
  });

  it("bounds SPL decimal exponents before constructing atomic units", () => {
    const input = {
      positions: [] as ReturnType<typeof position>[],
      bins: [] as DecodedBin[],
      currentPriceQ64,
      quoteSide: "y" as const,
      quotePriceUsdExact: "1",
      completePositionSet: true,
    };
    expect(
      valueAndRankPositions({ ...input, quoteDecimals: 255 }).valueCoverage,
    ).toBe("complete");
    expect(() =>
      valueAndRankPositions({ ...input, quoteDecimals: 256 }),
    ).toThrow(/decimals.*supported range/i);
  });
});

function rationalFromOracle(side: "quoteX" | "quoteY"): Rational {
  const expected = positionOracle.expected.currentValuation[side];
  return {
    numerator: BigInt(expected.valueUsdNumerator),
    denominator: BigInt(expected.valueUsdDenominator),
  };
}

function rational(numerator: bigint): Rational {
  return { numerator, denominator: 1n };
}

function valuedPosition(address: string, value: bigint): ValuedPosition {
  return {
    address,
    owner: "owner",
    lowerBinId: 0,
    upperBinId: 0,
    valueUsd: rational(value),
    valueUsdMicros: value * 1_000_000n,
    valuedBins: 1,
    nonzeroBins: 1,
    contributions: [],
  };
}

function resultFor(positions: ValuedPosition[]) {
  const total = positions.reduce(
    (sum, item) => sum + (item.valueUsd?.numerator ?? 0n),
    0n,
  );
  return {
    positions,
    totalValueUsd: rational(total),
    totalValueUsdMicros: total * 1_000_000n,
    valueCoverage: "complete" as const,
    missingBinIds: [],
  };
}

function position(address: string, lowerBinId: number, shares: bigint[]) {
  return {
    address,
    lbPair: positionOracle.pool,
    owner: "owner",
    lowerBinId,
    upperBinId: lowerBinId + shares.length - 1,
    liquidityShares: shares,
  };
}

function bin(
  binId: number,
  priceQ64: bigint,
  amountX: bigint,
  amountY: bigint,
): DecodedBin {
  return {
    binId,
    priceQ64,
    amountX,
    amountY,
    liquiditySupply: 100n,
  };
}
