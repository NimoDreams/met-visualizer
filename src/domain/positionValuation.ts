import {
  decodeBinArrayAccount,
  decodePositionV2Account,
  type DecodedBin,
  type DecodedPositionV2,
} from "./meteoraAccounts";

const Q64 = 1n << 64n;
const USD_SCALE = 1_000_000n;

export type ValuedPosition = {
  address: string;
  owner: string;
  lowerBinId: number;
  upperBinId: number;
  valueUsdMicros?: bigint;
  valuedBins: number;
  nonzeroBins: number;
  contributions: Array<{
    binId: number;
    amountX: bigint;
    amountY: bigint;
  }>;
};

export type PositionValueResult = {
  positions: ValuedPosition[];
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
  quoteSide: "x" | "y";
  quotePriceUsd?: number;
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
  return valueAndRankPositions({
    positions,
    bins,
    quoteSide: input.quoteSide,
    quotePriceUsd: input.quotePriceUsd,
    quoteDecimals: input.quoteDecimals,
    completePositionSet: input.completePositionSet,
  });
}

export function valueAndRankPositions(input: {
  positions: PositionForValuation[];
  bins: DecodedBin[];
  quoteSide: "x" | "y";
  quotePriceUsd?: number;
  quoteDecimals: number;
  completePositionSet: boolean;
}): PositionValueResult {
  const bins = new Map(input.bins.map((bin) => [bin.binId, bin]));
  const quoteUsdMicros =
    input.quotePriceUsd === undefined
      ? undefined
      : decimalToScaledBigint(input.quotePriceUsd, USD_SCALE);
  const atomicUnits = 10n ** BigInt(input.quoteDecimals);
  const missingBinIds = new Set<number>();
  let everyPositionValued =
    input.completePositionSet && quoteUsdMicros !== undefined;

  const positions = input.positions.map((position): ValuedPosition => {
    let quoteAtoms = 0n;
    let valuedBins = 0;
    let nonzeroBins = 0;
    let complete = true;
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
      contributions.push({ binId, amountX, amountY });
      quoteAtoms +=
        input.quoteSide === "y"
          ? amountY + (amountX * bin.priceQ64) / Q64
          : amountX + (amountY * Q64) / bin.priceQ64;
      valuedBins += 1;
    });
    if (!complete) everyPositionValued = false;
    return {
      address: position.address,
      owner: position.owner,
      lowerBinId: position.lowerBinId,
      upperBinId: position.upperBinId,
      valueUsdMicros:
        complete && quoteUsdMicros !== undefined
          ? (quoteAtoms * quoteUsdMicros) / atomicUnits
          : undefined,
      valuedBins,
      nonzeroBins,
      contributions,
    };
  });

  positions.sort((left, right) => {
    if (left.valueUsdMicros === undefined && right.valueUsdMicros === undefined)
      return left.address.localeCompare(right.address);
    if (left.valueUsdMicros === undefined) return 1;
    if (right.valueUsdMicros === undefined) return -1;
    if (left.valueUsdMicros !== right.valueUsdMicros)
      return left.valueUsdMicros > right.valueUsdMicros ? -1 : 1;
    return left.address.localeCompare(right.address);
  });
  return {
    positions,
    totalValueUsdMicros: everyPositionValued
      ? positions.reduce(
          (total, position) => total + (position.valueUsdMicros ?? 0n),
          0n,
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
    !result.totalValueUsdMicros ||
    result.totalValueUsdMicros <= 0n
  )
    return minimum;

  const target = (result.totalValueUsdMicros * 80n + 99n) / 100n;
  let cumulative = 0n;
  for (let index = 0; index < cap; index += 1) {
    cumulative += result.positions[index]?.valueUsdMicros ?? 0n;
    if (index + 1 >= minimum && cumulative >= target) return index + 1;
  }
  return cap;
}

function decimalToScaledBigint(value: number, scale: bigint): bigint {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("USD quote must be a positive finite number.");
  return BigInt(Math.round(value * Number(scale)));
}
