import type {
  GeckoTerminalProvider,
  QuotePrice,
} from "../providers/geckoTerminal";
import type {
  MeteoraMetadataProvider,
  MeteoraPoolMetadata,
  MeteoraPoolOrientation,
  MeteoraPoolPage,
} from "../providers/meteoraMetadata";
import { MeteoraMetadataError } from "../providers/meteoraMetadata";
import {
  countPoolPositions,
  discoverDlmmPools,
  type DiscoveredDlmmPool,
  type DlmmPoolDiscovery,
} from "../providers/meteoraRpc";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";

const MAX_PAGES_PER_ORIENTATION = 5;

export type DlmmPoolQualification =
  | "qualified"
  | "not-probed"
  | "no-positions"
  | "no-conversion"
  | "blacklisted"
  | "non-positive-tvl"
  | "unranked"
  | "decode-unavailable";

export type DlmmPoolItem = {
  address: string;
  discovery: DlmmPoolDiscovery["pools"][number];
  metadata?: MeteoraPoolMetadata;
  rank?: number;
  qualification: DlmmPoolQualification;
  qualificationDetail: string;
  positionCount?: number;
  quotePrice?: QuotePrice;
  quoteStale?: boolean;
};

export type DlmmPoolSession = {
  mint: string;
  pools: DlmmPoolItem[];
  enabledAddresses: string[];
  automaticSelectionAddress?: string;
  selectionState: "automatic" | "manual" | "manual-required";
  selectionDetail: string;
  metadataState: "complete" | "incomplete" | "unavailable";
  metadataDetail: string;
  metadataRequests: number;
  metadataStale: boolean;
  quoteStale: boolean;
  rpcStale: boolean;
  minimumSlot: number;
  maximumSlot: number;
  observedAt: number;
};

type MetadataResult = {
  state: "complete" | "incomplete" | "unavailable";
  detail: string;
  requests: number;
  metadata: MeteoraPoolMetadata[];
  candidates: Array<{
    pool: DiscoveredDlmmPool;
    metadata: MeteoraPoolMetadata;
  }>;
};

export async function loadDlmmPoolSession(
  rpc: ReadOnlySolanaRpc,
  metadataProvider: MeteoraMetadataProvider,
  geckoProvider: GeckoTerminalProvider,
  mint: string,
  signal: AbortSignal,
): Promise<DlmmPoolSession> {
  const discovery = await discoverDlmmPools(rpc, mint, signal);
  const metadataResult = await collectRankedMetadata(
    metadataProvider,
    mint,
    discovery,
    signal,
  );
  const qualification = new Map<
    string,
    {
      state: DlmmPoolQualification;
      detail: string;
      positionCount?: number;
      quotePrice?: QuotePrice;
    }
  >();
  let selectedAddress: string | undefined;
  let selectionDetail = metadataResult.detail;
  let maximumSlot = discovery.maximumSlot;

  if (metadataResult.state === "complete") {
    try {
      for (const candidate of metadataResult.candidates.slice(0, 3)) {
        const positions = await countPoolPositions(
          rpc,
          candidate.pool.address,
          maximumSlot,
          signal,
        );
        maximumSlot = Math.max(maximumSlot, positions.slot);
        if (positions.count === 0) {
          qualification.set(candidate.pool.address, {
            state: "no-positions",
            detail: "No PositionV2 accounts were found.",
            positionCount: 0,
          });
          continue;
        }

        const otherMint =
          candidate.pool.tokenXMint === mint
            ? candidate.pool.tokenYMint
            : candidate.pool.tokenXMint;
        const quotes = await geckoProvider.getQuotePrices([otherMint], {
          priority: "user",
          signal,
        });
        const quotePrice = quotes.get(otherMint);
        if (!quotePrice) {
          qualification.set(candidate.pool.address, {
            state: "no-conversion",
            detail: "The pool's other token has no current USD quote.",
            positionCount: positions.count,
          });
          continue;
        }

        selectedAddress = candidate.pool.address;
        qualification.set(candidate.pool.address, {
          state: "qualified",
          detail: "PositionV2 accounts and a current USD quote are available.",
          positionCount: positions.count,
          quotePrice,
        });
        selectionDetail =
          "Enabled the highest-ranked pool with positions and USD conversion.";
        break;
      }
    } catch (error) {
      if (signal.aborted) throw error;
      selectionDetail =
        error instanceof Error
          ? `Automatic qualification stopped: ${error.message}`
          : "Automatic qualification failed.";
    }
  }

  if (!selectedAddress && metadataResult.state === "complete") {
    selectionDetail = selectionDetail.startsWith("Automatic qualification")
      ? selectionDetail
      : "None of the first three ranked pools had both positions and USD conversion.";
  }

  const metadataByAddress = new Map(
    metadataResult.metadata.map((metadata) => [metadata.address, metadata]),
  );
  const rankByAddress = new Map(
    metadataResult.candidates.map((candidate, index) => [
      candidate.pool.address,
      index + 1,
    ]),
  );
  const pools = discovery.pools.map((pool): DlmmPoolItem => {
    const metadata = metadataByAddress.get(pool.address);
    const probed = qualification.get(pool.address);
    if (pool.decodeState === "unavailable") {
      return {
        address: pool.address,
        discovery: pool,
        metadata,
        qualification: "decode-unavailable",
        qualificationDetail: pool.reason,
      };
    }
    if (metadata?.blacklisted) {
      return {
        address: pool.address,
        discovery: pool,
        metadata,
        qualification: "blacklisted",
        qualificationDetail: "Provider metadata marks this pool blacklisted.",
      };
    }
    if (metadata && metadata.tvlUsd <= 0) {
      return {
        address: pool.address,
        discovery: pool,
        metadata,
        qualification: "non-positive-tvl",
        qualificationDetail: "Reported TVL is not positive.",
      };
    }
    if (probed) {
      return {
        address: pool.address,
        discovery: pool,
        metadata,
        rank: rankByAddress.get(pool.address),
        qualification: probed.state,
        qualificationDetail: probed.detail,
        positionCount: probed.positionCount,
        quotePrice: probed.quotePrice,
      };
    }
    if (rankByAddress.has(pool.address)) {
      return {
        address: pool.address,
        discovery: pool,
        metadata,
        rank: rankByAddress.get(pool.address),
        qualification: "not-probed",
        qualificationDetail: "Outside the completed automatic probes.",
      };
    }
    return {
      address: pool.address,
      discovery: pool,
      metadata,
      qualification: "unranked",
      qualificationDetail: metadata
        ? "Excluded from automatic ranking."
        : "No reconciled ranking metadata was loaded.",
    };
  });

  pools.sort(
    (left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      left.address.localeCompare(right.address),
  );

  return {
    mint,
    pools,
    enabledAddresses: selectedAddress ? [selectedAddress] : [],
    automaticSelectionAddress: selectedAddress,
    selectionState: selectedAddress ? "automatic" : "manual-required",
    selectionDetail,
    metadataState: metadataResult.state,
    metadataDetail: metadataResult.detail,
    metadataRequests: metadataResult.requests,
    metadataStale: false,
    quoteStale: false,
    rpcStale: false,
    minimumSlot: discovery.minimumSlot,
    maximumSlot,
    observedAt: Date.now(),
  };
}

async function collectRankedMetadata(
  provider: MeteoraMetadataProvider,
  mint: string,
  discovery: DlmmPoolDiscovery,
  signal: AbortSignal,
): Promise<MetadataResult> {
  const readyPools = new Map(
    discovery.pools
      .filter(
        (pool): pool is DiscoveredDlmmPool => pool.decodeState === "ready",
      )
      .map((pool) => [pool.address, pool]),
  );
  const states = new Map<
    MeteoraPoolOrientation,
    { pages: MeteoraPoolPage[]; nextPage: number; exhausted: boolean }
  >([
    ["x", { pages: [], nextPage: 1, exhausted: false }],
    ["y", { pages: [], nextPage: 1, exhausted: false }],
  ]);
  let requests = 0;

  const fetchNext = async (orientation: MeteoraPoolOrientation) => {
    const state = states.get(orientation)!;
    if (state.pages.length >= MAX_PAGES_PER_ORIENTATION) return false;
    const page = await readPageWithRetry(
      provider,
      mint,
      orientation,
      state.nextPage,
      signal,
      () => {
        requests += 1;
      },
      (candidate) =>
        validatePageContinuity(
          state.pages.at(-1),
          candidate,
          orientation,
          state.nextPage,
        ),
    );
    state.pages.push(page);
    state.nextPage += 1;
    state.exhausted = page.exhausted;
    return true;
  };

  try {
    await fetchNext("x");
    await fetchNext("y");
  } catch (error) {
    if (signal.aborted) throw error;
    return describeMetadataFailure(error, requests, states, readyPools, mint);
  }

  while (true) {
    const reconciled = reconcileMetadata(states, readyPools, mint);
    if (reconciled.mismatches.length > 0) {
      return {
        state: "incomplete",
        detail: `Ranking requires manual selection: ${reconciled.mismatches[0]}`,
        requests,
        metadata: reconciled.metadata,
        candidates: reconciled.candidates,
      };
    }
    const thirdTvl = reconciled.candidates[2]?.metadata.tvlUsd;
    const needed = (["x", "y"] as const).filter((orientation) => {
      const state = states.get(orientation)!;
      if (state.exhausted) return false;
      if (thirdTvl === undefined) return true;
      const frontier = state.pages.at(-1)?.frontierTvlUsd;
      return frontier === undefined || frontier >= thirdTvl;
    });
    if (needed.length === 0) {
      return {
        state: "complete",
        detail:
          "Both orientation frontiers are below the third ranked candidate or exhausted.",
        requests,
        metadata: reconciled.metadata,
        candidates: reconciled.candidates,
      };
    }
    if (
      needed.some(
        (orientation) =>
          states.get(orientation)!.pages.length >= MAX_PAGES_PER_ORIENTATION,
      )
    ) {
      return {
        state: "incomplete",
        detail: `Ranking frontier was not cleared within ${MAX_PAGES_PER_ORIENTATION} pages per orientation.`,
        requests,
        metadata: reconciled.metadata,
        candidates: reconciled.candidates,
      };
    }

    try {
      for (const orientation of needed) await fetchNext(orientation);
    } catch (error) {
      if (signal.aborted) throw error;
      return describeMetadataFailure(error, requests, states, readyPools, mint);
    }
  }
}

function validatePageContinuity(
  previous: MeteoraPoolPage | undefined,
  page: MeteoraPoolPage,
  orientation: MeteoraPoolOrientation,
  expectedPage: number,
): void {
  if (page.orientation !== orientation || page.currentPage !== expectedPage) {
    throw new MeteoraMetadataError(
      "shape",
      "Ranking page identity does not match the requested orientation or page.",
    );
  }
  if (!previous) return;
  if (
    page.pageCount !== previous.pageCount ||
    page.pageSize !== previous.pageSize ||
    page.total !== previous.total
  ) {
    throw new MeteoraMetadataError(
      "shape",
      "Ranking pagination changed across pages.",
    );
  }
  const previousFrontier = previous.pools.at(-1)?.tvlUsd;
  const nextLeader = page.pools[0]?.tvlUsd;
  if (
    previousFrontier !== undefined &&
    nextLeader !== undefined &&
    nextLeader > previousFrontier
  ) {
    throw new MeteoraMetadataError(
      "shape",
      "Ranking TVL order increased across a page boundary.",
    );
  }
}

function reconcileMetadata(
  states: Map<
    MeteoraPoolOrientation,
    { pages: MeteoraPoolPage[]; nextPage: number; exhausted: boolean }
  >,
  readyPools: Map<string, DiscoveredDlmmPool>,
  mint: string,
): {
  metadata: MeteoraPoolMetadata[];
  candidates: Array<{
    pool: DiscoveredDlmmPool;
    metadata: MeteoraPoolMetadata;
  }>;
  mismatches: string[];
} {
  const metadataByAddress = new Map<string, MeteoraPoolMetadata>();
  const mismatches: string[] = [];
  for (const state of states.values()) {
    for (const metadata of state.pages.flatMap((page) => page.pools)) {
      const existing = metadataByAddress.get(metadata.address);
      if (
        existing &&
        (existing.tokenXMint !== metadata.tokenXMint ||
          existing.tokenYMint !== metadata.tokenYMint ||
          existing.tvlUsd !== metadata.tvlUsd)
      ) {
        mismatches.push(`conflicting metadata for ${metadata.address}`);
        continue;
      }
      metadataByAddress.set(metadata.address, metadata);
    }
  }

  const candidates: Array<{
    pool: DiscoveredDlmmPool;
    metadata: MeteoraPoolMetadata;
  }> = [];
  for (const metadata of metadataByAddress.values()) {
    const pool = readyPools.get(metadata.address);
    if (!pool) {
      mismatches.push(
        `provider pool ${metadata.address} was absent from RPC discovery`,
      );
      continue;
    }
    if (
      pool.tokenXMint !== metadata.tokenXMint ||
      pool.tokenYMint !== metadata.tokenYMint ||
      (pool.tokenXMint !== mint && pool.tokenYMint !== mint)
    ) {
      mismatches.push(
        `provider pool ${metadata.address} did not match RPC mints`,
      );
      continue;
    }
    if (!metadata.blacklisted && metadata.tvlUsd > 0) {
      candidates.push({ pool, metadata });
    }
  }
  candidates.sort(
    (left, right) =>
      right.metadata.tvlUsd - left.metadata.tvlUsd ||
      right.metadata.volume24hUsd - left.metadata.volume24hUsd ||
      left.pool.address.localeCompare(right.pool.address),
  );
  return {
    metadata: [...metadataByAddress.values()],
    candidates,
    mismatches,
  };
}

async function readPageWithRetry(
  provider: MeteoraMetadataProvider,
  mint: string,
  orientation: MeteoraPoolOrientation,
  pageNumber: number,
  signal: AbortSignal,
  onAttempt: () => void,
  validate: (page: MeteoraPoolPage) => void,
): Promise<MeteoraPoolPage> {
  try {
    onAttempt();
    const page = await provider.getPoolPage(
      mint,
      orientation,
      pageNumber,
      signal,
    );
    validate(page);
    return page;
  } catch (firstError) {
    if (signal.aborted) throw firstError;
    await abortableDelay(250, signal);
    onAttempt();
    const page = await provider.getPoolPage(
      mint,
      orientation,
      pageNumber,
      signal,
    );
    validate(page);
    return page;
  }
}

function describeMetadataFailure(
  error: unknown,
  requests: number,
  states: Map<
    MeteoraPoolOrientation,
    { pages: MeteoraPoolPage[]; nextPage: number; exhausted: boolean }
  >,
  readyPools: Map<string, DiscoveredDlmmPool>,
  mint: string,
): MetadataResult {
  const reconciled = reconcileMetadata(states, readyPools, mint);
  const hasPartialPages = [...states.values()].some(
    (state) => state.pages.length > 0,
  );
  const incomplete =
    hasPartialPages ||
    (error instanceof MeteoraMetadataError && error.kind === "shape");
  const prefix = incomplete
    ? "Ranking metadata is incomplete"
    : "Ranking metadata unavailable";
  return {
    state: incomplete ? "incomplete" : "unavailable",
    detail:
      error instanceof Error ? `${prefix}: ${error.message}` : `${prefix}.`,
    requests,
    metadata: reconciled.metadata,
    candidates: reconciled.candidates,
  };
}

function abortableDelay(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Request was cancelled.", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
