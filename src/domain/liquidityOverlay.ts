import type { DlmmPoolItem } from "./dlmmPools";
import type { PoolPositionSession } from "./poolPositions";
import {
  addRational,
  compareRational,
  normalizeRational,
  parsePositiveDecimal,
  rationalPercentage,
  type Rational,
  type ValuedPosition,
} from "./positionValuation";
import type { ReferenceMarketSession } from "./referenceMarket";

const Q64 = 1n << 64n;

export type PoolOverlayState =
  "loading" | "ready" | "refreshing" | "cancelled" | "error";

export type PoolOverlayInput = {
  pool: DlmmPoolItem;
  state: PoolOverlayState;
  session?: PoolPositionSession;
};

export type LiquidityFilter =
  | { mode: "all" }
  | { mode: "minimum"; minimumUsd: Rational; input: string }
  | { mode: "largest"; previousKeys: readonly string[] };

export type LiquidityContribution = {
  id: string;
  poolAddress: string;
  poolLabel: string;
  positionAddress: string;
  positionKey: string;
  binId: number;
  axisPrice: number;
  valueUsd: Rational;
};

export type LiquidityLevel = {
  id: string;
  axisPrice: number;
  valueUsd: Rational;
  contributions: LiquidityContribution[];
};

export type GlobalPosition = {
  key: string;
  poolAddress: string;
  poolLabel: string;
  position: ValuedPosition;
  selected: boolean;
  visible: boolean;
  commonAxisAvailable: boolean;
  unavailableReason?: string;
  axisMinimum?: number;
  axisMaximum?: number;
};

export type LiquidityOverlayModel = {
  levels: LiquidityLevel[];
  positions: GlobalPosition[];
  filterKeys: ReadonlySet<string>;
  largestTargetKeys: string[];
  filterMode: LiquidityFilter["mode"];
  completeDenominator: boolean;
  totalValuedUsd?: Rational;
  filteredValueUsd?: Rational;
  filteredValuePercent?: number;
  valuedCount: number;
  unavailableCount: number;
  filteredCount: number;
  shownCount: number;
  selectedIncludedCount: number;
  enabledPoolCount: number;
  readyPoolCount: number;
  unopenedPoolCount: number;
  refreshingPoolCount: number;
  overlayUnavailableCount: number;
  axisLabel?: string;
  scopeDetail: string;
};

export function buildLiquidityOverlay(input: {
  reference?: ReferenceMarketSession;
  pools: readonly PoolOverlayInput[];
  totalPoolCount: number;
  filter: LiquidityFilter;
}): LiquidityOverlayModel {
  const readyPools = input.pools.filter(
    (item): item is PoolOverlayInput & { session: PoolPositionSession } =>
      item.session !== undefined,
  );
  const positions = readyPools
    .flatMap(({ pool, session }) =>
      session.positions.map((position, index) =>
        describePosition(
          input.reference,
          pool,
          session,
          position,
          index < session.visibleCount,
        ),
      ),
    )
    .sort(compareGlobalPositions);
  const valued = positions.filter(({ position }) => position.valueUsd);
  const completeDenominator =
    input.pools.length > 0 &&
    readyPools.length === input.pools.length &&
    readyPools.every(
      ({ state, session }) =>
        state === "ready" &&
        !session.stale &&
        session.valueCoverage === "complete" &&
        session.positions.length === session.discoveredCount &&
        session.positions.every(({ valueUsd }) => valueUsd !== undefined),
    );
  const totalValuedUsd = valued.reduce<Rational>(
    (total, item) => addRational(total, item.position.valueUsd!),
    { numerator: 0n, denominator: 1n },
  );
  const largestTargetKeys = completeDenominator
    ? largestContributors(valued, totalValuedUsd)
    : input.filter.mode === "largest"
      ? [...input.filter.previousKeys]
      : [];
  const largestTargetSet = new Set(largestTargetKeys);
  const filterKeys = new Set(
    valued
      .filter((item) => matchesFilter(item, input.filter, largestTargetSet))
      .map(({ key }) => key),
  );
  const filtered = valued.filter(({ key }) => filterKeys.has(key));
  const filteredValueUsd = filtered.reduce<Rational>(
    (total, item) => addRational(total, item.position.valueUsd!),
    { numerator: 0n, denominator: 1n },
  );
  const levelMap = new Map<string, LiquidityLevel>();
  const seenContributions = new Set<string>();
  const poolByAddress = new Map(
    readyPools.map((poolInput) => [poolInput.pool.address, poolInput]),
  );

  for (const item of filtered) {
    if (!item.selected || !item.commonAxisAvailable) continue;
    const poolInput = poolByAddress.get(item.poolAddress);
    if (!poolInput) continue;
    const contributionWeights = item.position.contributions.map(
      (contribution) =>
        currentContributionQuoteAtoms(poolInput.session, contribution),
    );
    const totalWeight = contributionWeights.reduce<Rational>(addRational, {
      numerator: 0n,
      denominator: 1n,
    });
    for (const [index, contribution] of item.position.contributions.entries()) {
      const normalized = normalizeContribution(
        input.reference!,
        poolInput.session,
        item,
        contribution,
        contributionWeights[index]!,
        totalWeight,
      );
      if (!normalized || seenContributions.has(normalized.id)) continue;
      seenContributions.add(normalized.id);
      const key = rationalKey(normalized.axisPriceExact);
      const level = levelMap.get(key);
      const publicContribution: LiquidityContribution = {
        id: normalized.id,
        poolAddress: item.poolAddress,
        poolLabel: item.poolLabel,
        positionAddress: item.position.address,
        positionKey: item.key,
        binId: contribution.binId,
        axisPrice: rationalToNumber(normalized.axisPriceExact),
        valueUsd: normalized.valueUsd,
      };
      if (level) {
        level.valueUsd = addRational(level.valueUsd, normalized.valueUsd);
        level.contributions.push(publicContribution);
      } else {
        levelMap.set(key, {
          id: `level:${key}`,
          axisPrice: publicContribution.axisPrice,
          valueUsd: normalized.valueUsd,
          contributions: [publicContribution],
        });
      }
    }
  }

  const levels = [...levelMap.values()]
    .filter(
      ({ axisPrice, valueUsd }) =>
        Number.isFinite(axisPrice) && axisPrice > 0 && valueUsd.numerator > 0n,
    )
    .sort((left, right) => left.axisPrice - right.axisPrice);
  const refreshingPoolCount = input.pools.filter(
    ({ state }) => state === "refreshing" || state === "loading",
  ).length;
  const unavailableCount = positions.length - valued.length;
  const overlayUnavailableCount = positions.filter(
    ({ commonAxisAvailable }) => !commonAxisAvailable,
  ).length;
  const unopenedPoolCount = Math.max(
    0,
    input.totalPoolCount - input.pools.length,
  );
  const filteredValuePercent =
    totalValuedUsd.numerator > 0n
      ? rationalPercentage(filteredValueUsd, totalValuedUsd)
      : undefined;

  return {
    levels,
    positions,
    filterKeys,
    largestTargetKeys,
    filterMode: input.filter.mode,
    completeDenominator,
    totalValuedUsd,
    filteredValueUsd,
    filteredValuePercent,
    valuedCount: valued.length,
    unavailableCount,
    filteredCount: filtered.length,
    shownCount:
      input.filter.mode === "all"
        ? filtered.filter(({ visible }) => visible).length
        : filtered.length,
    selectedIncludedCount: filtered.filter(
      ({ selected, commonAxisAvailable }) => selected && commonAxisAvailable,
    ).length,
    enabledPoolCount: input.pools.length,
    readyPoolCount: readyPools.length,
    unopenedPoolCount,
    refreshingPoolCount,
    overlayUnavailableCount,
    axisLabel: input.reference?.basis.label,
    scopeDetail: describeScope({
      enabled: input.pools.length,
      ready: readyPools.length,
      unopened: unopenedPoolCount,
      unavailable: unavailableCount,
      overlayUnavailable: overlayUnavailableCount,
      complete: completeDenominator,
    }),
  };
}

export function positionOverlayKey(
  poolAddress: string,
  positionAddress: string,
): string {
  return `${poolAddress}:${positionAddress}`;
}

export function parseMinimumUsd(value: string): Rational | undefined {
  const normalized = value.trim();
  if (normalized === "" || /^0+(?:\.0+)?$/.test(normalized))
    return { numerator: 0n, denominator: 1n };
  try {
    return parsePositiveDecimal(normalized);
  } catch {
    return undefined;
  }
}

export function rationalToNumber(value: Rational): number {
  const integer = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;
  return (
    Number(integer) +
    Number((remainder * 1_000_000_000_000n) / value.denominator) /
      1_000_000_000_000
  );
}

function describePosition(
  reference: ReferenceMarketSession | undefined,
  pool: DlmmPoolItem,
  session: PoolPositionSession,
  position: ValuedPosition,
  visible: boolean,
): GlobalPosition {
  const key = positionOverlayKey(pool.address, position.address);
  const selected = session.selectedAddresses.includes(position.address);
  const poolLabel = pool.metadata?.name ?? shortAddress(pool.address);
  const reason = unavailableReason(reference, session, position);
  const axisPrices = reason
    ? []
    : position.contributions
        .map((contribution) =>
          normalizeBinPrice(reference!, session, contribution.priceQ64),
        )
        .filter((value): value is Rational => value !== undefined)
        .map(rationalToNumber)
        .filter((value) => Number.isFinite(value) && value > 0);
  return {
    key,
    poolAddress: pool.address,
    poolLabel,
    position,
    selected,
    visible,
    commonAxisAvailable: reason === undefined && axisPrices.length > 0,
    unavailableReason:
      reason ??
      (axisPrices.length === 0
        ? "No nonzero bin contribution can be placed on the chart axis."
        : undefined),
    axisMinimum: axisPrices.length ? Math.min(...axisPrices) : undefined,
    axisMaximum: axisPrices.length ? Math.max(...axisPrices) : undefined,
  };
}

function unavailableReason(
  reference: ReferenceMarketSession | undefined,
  session: PoolPositionSession,
  position: ValuedPosition,
): string | undefined {
  if (!position.valueUsd)
    return session.missingBinCount > 0
      ? "Incomplete bin data prevents a current USD value."
      : "A current USD value is unavailable.";
  if (!reference || reference.mint !== session.enteredMint)
    return "The reference chart axis is unavailable for this token.";
  if (!session.quotePriceUsdExact || !session.currentPriceQ64)
    return "The pool has no supported current USD conversion.";
  return undefined;
}

function normalizeContribution(
  reference: ReferenceMarketSession,
  session: PoolPositionSession,
  item: GlobalPosition,
  contribution: ValuedPosition["contributions"][number],
  contributionWeight: Rational,
  totalWeight: Rational,
): { id: string; axisPriceExact: Rational; valueUsd: Rational } | undefined {
  const axisPriceExact = normalizeBinPrice(
    reference,
    session,
    contribution.priceQ64,
  );
  if (
    !axisPriceExact ||
    !item.position.valueUsd ||
    contributionWeight.numerator <= 0n ||
    totalWeight.numerator <= 0n
  )
    return undefined;
  return {
    id: `${item.key}:${contribution.binId}`,
    axisPriceExact,
    // Apportion the reviewed position value by each bin's current-price
    // principal. This preserves an exact position total even where the source
    // valuation rounded conversion to atomic quote units once per position.
    valueUsd: multiplyRational(item.position.valueUsd, contributionWeight, {
      numerator: totalWeight.denominator,
      denominator: totalWeight.numerator,
    }),
  };
}

function normalizeBinPrice(
  reference: ReferenceMarketSession,
  session: PoolPositionSession,
  binPriceQ64: bigint,
): Rational | undefined {
  if (
    reference.mint !== session.enteredMint ||
    !session.quotePriceUsdExact ||
    binPriceQ64 <= 0n
  )
    return undefined;
  const quoteUsd = parsePositiveDecimal(session.quotePriceUsdExact);
  const decimalScale = powerOfTenRatio(
    reference.token.decimals - session.quoteDecimals,
  );
  const tokenPrice =
    session.quoteSide === "y"
      ? multiplyRational(
          quoteUsd,
          decimalScale,
          normalizeRational({ numerator: binPriceQ64, denominator: Q64 }),
        )
      : multiplyRational(
          quoteUsd,
          decimalScale,
          normalizeRational({ numerator: Q64, denominator: binPriceQ64 }),
        );
  return multiplyRational(
    tokenPrice,
    parsePositiveDecimal(reference.basis.displaySupply.toString()),
  );
}

function currentContributionQuoteAtoms(
  session: PoolPositionSession,
  contribution: ValuedPosition["contributions"][number],
): Rational {
  if (!session.currentPriceQ64) return { numerator: 0n, denominator: 1n };
  return session.quoteSide === "y"
    ? addRational(
        { numerator: contribution.amountY, denominator: 1n },
        normalizeRational({
          numerator: contribution.amountX * session.currentPriceQ64,
          denominator: Q64,
        }),
      )
    : addRational(
        { numerator: contribution.amountX, denominator: 1n },
        normalizeRational({
          numerator: contribution.amountY * Q64,
          denominator: session.currentPriceQ64,
        }),
      );
}

function matchesFilter(
  item: GlobalPosition,
  filter: LiquidityFilter,
  largestKeys: ReadonlySet<string>,
): boolean {
  if (!item.position.valueUsd) return false;
  if (filter.mode === "all") return true;
  if (filter.mode === "minimum")
    return compareRational(item.position.valueUsd, filter.minimumUsd) >= 0;
  return largestKeys.has(item.key);
}

function largestContributors(
  positions: GlobalPosition[],
  total: Rational,
): string[] {
  if (total.numerator <= 0n) return [];
  const keys: string[] = [];
  let cumulative: Rational = { numerator: 0n, denominator: 1n };
  for (const item of positions) {
    cumulative = addRational(cumulative, item.position.valueUsd!);
    keys.push(item.key);
    if (
      compareRational(
        {
          numerator: cumulative.numerator * 100n,
          denominator: cumulative.denominator,
        },
        { numerator: total.numerator * 80n, denominator: total.denominator },
      ) >= 0
    )
      break;
  }
  return keys;
}

function compareGlobalPositions(left: GlobalPosition, right: GlobalPosition) {
  if (left.position.valueUsd && right.position.valueUsd) {
    const value = compareRational(
      left.position.valueUsd,
      right.position.valueUsd,
    );
    if (value !== 0) return -value;
  } else if (left.position.valueUsd) return -1;
  else if (right.position.valueUsd) return 1;
  const pool = left.poolAddress.localeCompare(right.poolAddress);
  return pool || left.position.address.localeCompare(right.position.address);
}

function multiplyRational(...values: Rational[]): Rational {
  return normalizeRational(
    values.reduce<Rational>(
      (product, value) => ({
        numerator: product.numerator * value.numerator,
        denominator: product.denominator * value.denominator,
      }),
      { numerator: 1n, denominator: 1n },
    ),
  );
}

function powerOfTenRatio(exponent: number): Rational {
  return exponent >= 0
    ? { numerator: 10n ** BigInt(exponent), denominator: 1n }
    : { numerator: 1n, denominator: 10n ** BigInt(-exponent) };
}

function rationalKey(value: Rational): string {
  const normalized = normalizeRational(value);
  return `${normalized.numerator}/${normalized.denominator}`;
}

function describeScope(input: {
  enabled: number;
  ready: number;
  unopened: number;
  unavailable: number;
  overlayUnavailable: number;
  complete: boolean;
}): string {
  const parts = [
    `${input.ready} of ${input.enabled} enabled pools valued`,
    `${input.unopened} unopened pools excluded`,
    `${input.unavailable} unavailable values excluded`,
  ];
  if (input.overlayUnavailable > input.unavailable)
    parts.push(
      `${input.overlayUnavailable - input.unavailable} valued positions lack a common-axis overlay`,
    );
  if (!input.complete)
    parts.push("largest-contributor denominator is incomplete");
  return parts.join(" · ");
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}
