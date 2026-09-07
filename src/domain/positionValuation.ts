import {
  decodeBinArrayAccount,
  decodePositionV2Account,
  type DecodedBin,
  type DecodedPositionV2,
} from "./meteoraAccounts";
import {
  MAX_SPL_DECIMALS,
  boundedDecimalParts,
  isSafeIntegerInRange,
} from "./providerLimits";

const Q64 = 1n << 64n;
const USD_SCALE = 1_000_000n;

export type Rational = { numerator: bigint; denominator: bigint };

export type ValuedPosition = {
  address: string;
  owner: string;
  lowerBinId: number;
  upperBinId: number;
  valueUsd?: Rational;
  valueUsdMicros?: bigint;
  valuedBins: number;
  nonzeroBins: number;
  contributions: Array<{
    binId: number;
    amountX: bigint;
    amountY: bigint;
    priceQ64: bigint;
  }>;
};

export type PositionValueResult = {
  positions: ValuedPosition[];
  currentPriceQ64?: bigint;
  totalValueUsd?: Rational;
  totalValueUsdMicros?: bigint;
  valueCoverage: "complete" | "unknown";
  missingBinIds: number[];
};

export type PositionForValuation = DecodedPositionV2 & { address: string };

export type EncodedPositionForValuation = {
  address: string;
  data: string;
};

export function prepareAndRankPositionAccounts(input: {
  poolAddress: string;
  positionAccounts: EncodedPositionForValuation[];
  binArrayData: string[];
  activeBinId: number;
  quoteSide: "x" | "y";
  quotePriceUsdExact?: string;
  quoteDecimals: number;
  completePositionSet: boolean;
}): PositionValueResult {
  const positions = input.positionAccounts.map(({ address, data }) => ({
    address,
    ...decodePositionV2Account(data, input.poolAddress),
  }));
  const bins = input.binArrayData.flatMap(
    (data) => decodeBinArrayAccount(data, input.poolAddress).bins,
  );
  const binIds = bins.map(({ binId }) => binId);
  if (new Set(binIds).size !== binIds.length)
    throw new Error("BinArray scan returned overlapping bin indexes.");
  const currentPriceQ64 = bins.find(
    ({ binId }) => binId === input.activeBinId,
  )?.priceQ64;
  return valueAndRankPositions({
    positions,
    bins,
    quoteSide: input.quoteSide,
    currentPriceQ64,
    quotePriceUsdExact: input.quotePriceUsdExact,
    quoteDecimals: input.quoteDecimals,
    completePositionSet: input.completePositionSet,
  });
}

export function valueAndRankPositions(input: {
  positions: PositionForValuation[];
  bins: DecodedBin[];
  quoteSide: "x" | "y";
  currentPriceQ64?: bigint;
  quotePriceUsdExact?: string;
  quoteDecimals: number;
  completePositionSet: boolean;
}): PositionValueResult {
  if (!isSafeIntegerInRange(input.quoteDecimals, 0, MAX_SPL_DECIMALS))
    throw new Error("Quote-token decimals are outside the supported range.");
  const bins = new Map(input.bins.map((bin) => [bin.binId, bin]));
  const quoteUsd =
    input.quotePriceUsdExact === undefined
      ? undefined
      : parsePositiveDecimal(input.quotePriceUsdExact);
  const atomicUnits = 10n ** BigInt(input.quoteDecimals);
  const missingBinIds = new Set<number>();
  let everyPositionValued =
    input.completePositionSet &&
    quoteUsd !== undefined &&
    input.currentPriceQ64 !== undefined &&
    input.currentPriceQ64 > 0n;

  const positions = input.positions.map((position): ValuedPosition => {
    let quoteAtoms = 0n;
    let valuedBins = 0;
    let nonzeroBins = 0;
    let complete = true;
    let totalX = 0n;
    let totalY = 0n;
    const contributions: ValuedPosition["contributions"] = [];
    position.liquidityShares.forEach((share, index) => {
      if (share === 0n) return;
      nonzeroBins += 1;
      const binId = position.lowerBinId + index;
      const bin = bins.get(binId);
      if (!bin || bin.liquiditySupply === 0n || bin.priceQ64 === 0n) {
        missingBinIds.add(binId);
        complete = false;
        return;
      }
      const amountX = (share * bin.amountX) / bin.liquiditySupply;
      const amountY = (share * bin.amountY) / bin.liquiditySupply;
      contributions.push({ binId, amountX, amountY, priceQ64: bin.priceQ64 });
      totalX += amountX;
      totalY += amountY;
      valuedBins += 1;
    });
    if (input.currentPriceQ64 && input.currentPriceQ64 > 0n) {
      quoteAtoms =
        input.quoteSide === "y"
          ? totalY + (totalX * input.currentPriceQ64) / Q64
          : totalX + (totalY * Q64) / input.currentPriceQ64;
    } else complete = false;
    if (!complete) everyPositionValued = false;
    const valueUsd =
      complete && quoteUsd
        ? normalizeRational({
            numerator: quoteAtoms * quoteUsd.numerator,
            denominator: atomicUnits * quoteUsd.denominator,
          })
        : undefined;
    return {
      address: position.address,
      owner: position.owner,
      lowerBinId: position.lowerBinId,
      upperBinId: position.upperBinId,
      valueUsd,
      valueUsdMicros: valueUsd
        ? divideRounded(valueUsd.numerator * USD_SCALE, valueUsd.denominator)
        : undefined,
      valuedBins,
      nonzeroBins,
      contributions,
    };
  });

  positions.sort((left, right) => {
    if (left.valueUsd === undefined && right.valueUsd === undefined)
      return left.address.localeCompare(right.address);
    if (left.valueUsd === undefined) return 1;
    if (right.valueUsd === undefined) return -1;
    const comparison = compareRational(left.valueUsd, right.valueUsd);
    if (comparison !== 0) return -comparison;
    return left.address.localeCompare(right.address);
  });
  const totalValueUsd = everyPositionValued
    ? positions.reduce<Rational>(
        (total, position) => addRational(total, position.valueUsd!),
        { numerator: 0n, denominator: 1n },
      )
    : undefined;
  return {
    positions,
    currentPriceQ64: input.currentPriceQ64,
    totalValueUsd,
    totalValueUsdMicros: totalValueUsd
      ? divideRounded(
          totalValueUsd.numerator * USD_SCALE,
          totalValueUsd.denominator,
        )
      : undefined,
    valueCoverage: everyPositionValued ? "complete" : "unknown",
    missingBinIds: [...missingBinIds].sort((left, right) => left - right),
  };
}

export function initialPositionCount(result: PositionValueResult): number {
  const total = result.positions.length;
  if (total <= 100) return total;
  const minimum = Math.min(25, total);
  const cap = Math.min(100, total);
  if (
    result.valueCoverage !== "complete" ||
    !result.totalValueUsd ||
    result.totalValueUsd.numerator <= 0n
  )
    return minimum;

  let cumulative: Rational = { numerator: 0n, denominator: 1n };
  for (let index = 0; index < cap; index += 1) {
    const value = result.positions[index]?.valueUsd;
    if (value) cumulative = addRational(cumulative, value);
    if (
      index + 1 >= minimum &&
      compareRational(
        {
          numerator: cumulative.numerator * 100n,
          denominator: cumulative.denominator,
        },
        {
          numerator: result.totalValueUsd.numerator * 80n,
          denominator: result.totalValueUsd.denominator,
        },
      ) >= 0
    )
      return index + 1;
  }
  return cap;
}

export function parsePositiveDecimal(value: string): Rational {
  const parts = boundedDecimalParts(value);
  if (!parts)
    throw new Error("USD quote is outside the supported decimal range.");
  const digits = BigInt(parts.digits);
  if (digits <= 0n) throw new Error("USD quote must be positive.");
  const scale = parts.fractionalDigits - parts.exponent;
  return normalizeRational(
    scale >= 0
      ? { numerator: digits, denominator: 10n ** BigInt(scale) }
      : { numerator: digits * 10n ** BigInt(-scale), denominator: 1n },
  );
}

export function addRational(left: Rational, right: Rational): Rational {
  return normalizeRational({
    numerator:
      left.numerator * right.denominator + right.numerator * left.denominator,
    denominator: left.denominator * right.denominator,
  });
}

export function compareRational(left: Rational, right: Rational): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

export function rationalPercentage(
  part: Rational,
  whole: Rational,
): number | undefined {
  if (whole.numerator <= 0n) return undefined;
  const hundredths =
    (part.numerator * whole.denominator * 10_000n) /
    (part.denominator * whole.numerator);
  return Number(hundredths) / 100;
}

export function normalizeRational(value: Rational): Rational {
  const divisor = greatestCommonDivisor(value.numerator, value.denominator);
  return {
    numerator: value.numerator / divisor,
    denominator: value.denominator / divisor,
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}
