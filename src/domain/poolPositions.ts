import type { DlmmPoolItem } from "./dlmmPools";
import {
  initialPositionCount,
  type Rational,
  type PositionValueResult,
  type ValuedPosition,
} from "./positionValuation";
import type { GeckoTerminalProvider } from "../providers/geckoTerminal";
import {
  loadPositionRpcSnapshot,
  type PositionRpcProgress,
} from "../providers/positionRpc";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import { rankPositions } from "../workers/positionWorker";

export type PoolPositionSession = {
  poolAddress: string;
  positions: ValuedPosition[];
  visibleCount: number;
  selectedAddresses: string[];
  manualSelection: boolean;
  discoveredCount: number;
  valueCoverage: "complete" | "unknown";
  totalValueUsdMicros?: bigint;
  totalValueUsd?: Rational;
  missingBinCount: number;
  binArrayCount: number;
  minimumSlot: number;
  maximumSlot: number;
  requests: number;
  bytes: number;
  elapsedMs: number;
  observedAt: number;
  quoteMint?: string;
  quotePriceUsdExact?: string;
  quoteObservedAt?: number;
  stale: boolean;
  loadingMode: "portable-batched";
  detail: string;
};

export async function loadPoolPositionSession(
  rpc: ReadOnlySolanaRpc,
  gecko: GeckoTerminalProvider,
  pool: DlmmPoolItem,
  enteredMint: string,
  minContextSlot: number,
  signal: AbortSignal,
  onProgress?: (progress: PositionRpcProgress) => void,
  refreshQuote = false,
): Promise<PoolPositionSession> {
  if (pool.discovery.decodeState !== "ready")
    throw new Error("This pool cannot be decoded as a supported LB pair.");
  const startedAt = performance.now();
  const tokenX = pool.discovery.tokenXMint;
  const otherMint = tokenX === enteredMint ? pool.discovery.tokenYMint : tokenX;
  const quoteSide = tokenX === enteredMint ? "y" : "x";
  const [rpcSnapshot, quoteResult] = await Promise.all([
    loadPositionRpcSnapshot(
      rpc,
      pool.address,
      otherMint,
      minContextSlot,
      signal,
      onProgress,
    ),
    pool.quotePrice && !refreshQuote
      ? Promise.resolve(pool.quotePrice)
      : gecko
          .getQuotePrices([otherMint], {
            priority: "user",
            signal,
            fresh: refreshQuote,
          })
          .then((quotes) => quotes.get(otherMint)),
  ]);
  const result: PositionValueResult = await rankPositions(
    {
      poolAddress: pool.address,
      positionAccounts: rpcSnapshot.positionAccounts,
      binArrayData: rpcSnapshot.binArrayData,
      activeBinId: pool.discovery.activeId,
      quoteSide,
      quotePriceUsdExact:
        quoteResult?.priceUsdExact ?? quoteResult?.priceUsd.toString(),
      quoteDecimals: rpcSnapshot.quoteDecimals,
      completePositionSet: rpcSnapshot.completePositionSet,
    },
    signal,
  );
  const visibleCount = initialPositionCount(result);
  const visible = result.positions.slice(0, visibleCount);
  return {
    poolAddress: pool.address,
    positions: result.positions,
    visibleCount,
    selectedAddresses: visible.map(({ address }) => address),
    manualSelection: false,
    discoveredCount: rpcSnapshot.discoveredCount,
    valueCoverage: result.valueCoverage,
    totalValueUsdMicros: result.totalValueUsdMicros,
    totalValueUsd: result.totalValueUsd,
    missingBinCount: result.missingBinIds.length,
    binArrayCount: rpcSnapshot.binArrayData.length,
    minimumSlot: rpcSnapshot.minimumSlot,
    maximumSlot: rpcSnapshot.maximumSlot,
    requests: rpcSnapshot.requests,
    bytes: rpcSnapshot.bytes,
    elapsedMs: Math.round(performance.now() - startedAt),
    observedAt: Date.now(),
    quoteMint: quoteResult ? otherMint : undefined,
    quotePriceUsdExact:
      quoteResult?.priceUsdExact ?? quoteResult?.priceUsd.toString(),
    quoteObservedAt: quoteResult?.observedAt,
    stale: false,
    loadingMode: "portable-batched",
    detail: quoteResult
      ? result.valueCoverage === "complete"
        ? "All discovered positions were valued and ranked by current USD principal."
        : "Position values are a subset because the complete denominator is unavailable."
      : "The other token has no current USD quote; position value coverage is unknown.",
  };
}

export function revealPositions(
  session: PoolPositionSession,
  mode: "next" | "all",
): PoolPositionSession {
  const visibleCount =
    mode === "all"
      ? session.positions.length
      : Math.min(session.visibleCount + 100, session.positions.length);
  const newlyVisible = session.positions.slice(
    session.visibleCount,
    visibleCount,
  );
  return {
    ...session,
    visibleCount,
    selectedAddresses: session.manualSelection
      ? session.selectedAddresses
      : [
          ...session.selectedAddresses,
          ...newlyVisible.map(({ address }) => address),
        ],
  };
}

export function togglePositionSelection(
  session: PoolPositionSession,
  address: string,
): PoolPositionSession {
  const selected = new Set(session.selectedAddresses);
  if (selected.has(address)) selected.delete(address);
  else selected.add(address);
  return {
    ...session,
    selectedAddresses: [...selected],
    manualSelection: true,
  };
}
