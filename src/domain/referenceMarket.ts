import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import {
  intervalSeconds,
  type CandleInterval,
  type GeckoCandle,
  type GeckoPoolCandidate,
  type GeckoTerminalProvider,
  type GeckoTokenMetadata,
  GeckoTerminalError,
} from "../providers/geckoTerminal";
import type { PublicRequestPriority } from "../providers/publicRequestBudget";
import {
  MAX_SPL_DECIMALS,
  isSafeIntegerInRange,
  isSupportedSplAmount,
} from "./providerLimits";

const DEFAULT_HISTORY_SECONDS = 24 * 60 * 60;
const ADEQUATE_HISTORY_SECONDS = 23 * 60 * 60;

export type ValuationBasis =
  | {
      kind: "market-cap";
      label: "Market Cap (USD)";
      source: "CoinGecko verified";
      displaySupply: number;
      observedAt: number;
    }
  | {
      kind: "fdv";
      label: "FDV (USD)";
      source: "current Solana mint supply";
      displaySupply: number;
      observedAt: number;
    }
  | {
      kind: "price";
      label: "Price (USD)";
      source: "GeckoTerminal";
      displaySupply: 1;
      observedAt: number;
      reason: string;
    };

export type ValuationCandle = GeckoCandle & {
  priceOpen: number;
  priceHigh: number;
  priceLow: number;
  priceClose: number;
};

export type Freshness = {
  state: "current" | "delayed" | "unknown";
  detail: string;
};

export type CandidateRejection = {
  address: string;
  name: string;
  reason: string;
};

export type ReferenceMarketSession = {
  mint: string;
  token: GeckoTokenMetadata;
  basis: ValuationBasis;
  candidates: GeckoPoolCandidate[];
  market: GeckoPoolCandidate;
  candles: ValuationCandle[];
  interval: CandleInterval;
  limitedHistory: boolean;
  freshness: Freshness;
  rejected: CandidateRejection[];
  observedAt: number;
};

export class NoReferenceMarketError extends Error {
  constructor(
    message: string,
    readonly candidates: GeckoPoolCandidate[] = [],
  ) {
    super(message);
    this.name = "NoReferenceMarketError";
  }
}

type TokenSupplyResponse = {
  value: { amount: string; decimals: number };
};

export async function loadReferenceMarket(
  provider: GeckoTerminalProvider,
  rpc: ReadOnlySolanaRpc | undefined,
  mint: string,
  signal: AbortSignal,
  now = Date.now(),
): Promise<ReferenceMarketSession> {
  const [token, candidates] = await Promise.all([
    provider.getToken(mint, signal),
    provider.getPools(mint, signal),
  ]);

  if (candidates.length === 0) {
    throw new NoReferenceMarketError(
      "No GeckoTerminal markets were found for this token.",
    );
  }

  const [selection, basis] = await Promise.all([
    selectReferenceMarket(provider, candidates, signal, now),
    resolveValuationBasis(token, rpc, mint, signal),
  ]);

  return sessionFromSelection({
    mint,
    token,
    basis,
    candidates,
    interval: "15m",
    now,
    ...selection,
  });
}

export async function loadMarketCandles(
  provider: GeckoTerminalProvider,
  session: ReferenceMarketSession,
  market: GeckoPoolCandidate,
  interval: CandleInterval,
  signal: AbortSignal,
  priority: PublicRequestPriority,
  now = Date.now(),
): Promise<ReferenceMarketSession> {
  const result = await probeCandidate(
    provider,
    market,
    interval,
    signal,
    now,
    priority,
  );
  if (!result.usable) {
    throw new NoReferenceMarketError(result.reason, session.candidates);
  }

  return sessionFromSelection({
    mint: session.mint,
    token: session.token,
    basis: session.basis,
    candidates: session.candidates,
    market,
    candles: result.candles,
    interval,
    limitedHistory: !result.adequate,
    rejected: session.rejected,
    now,
  });
}

export async function refreshReferenceMarket(
  provider: GeckoTerminalProvider,
  session: ReferenceMarketSession,
  signal: AbortSignal,
  now = Date.now(),
): Promise<ReferenceMarketSession> {
  const latest = completedCandles(
    await provider.getCandles(session.market, session.interval, {
      limit: 10,
      priority: "selected",
      signal,
    }),
    session.interval,
    now,
  );
  const merged = mergeCandles(session.candles.map(stripValuation), latest);
  if (merged.length === 0) {
    throw new NoReferenceMarketError(
      "The selected market returned no completed candles.",
      session.candidates,
    );
  }

  return sessionFromSelection({
    mint: session.mint,
    token: session.token,
    basis: session.basis,
    candidates: session.candidates,
    market: session.market,
    candles: merged,
    interval: session.interval,
    limitedHistory: !hasAdequateHistory(
      merged,
      session.market,
      session.interval,
      now,
    ),
    rejected: session.rejected,
    now,
  });
}

export async function loadOlderCandles(
  provider: GeckoTerminalProvider,
  session: ReferenceMarketSession,
  signal: AbortSignal,
  now = Date.now(),
): Promise<ReferenceMarketSession> {
  const first = session.candles[0];
  if (!first) return session;

  const older = await provider.getCandles(session.market, session.interval, {
    beforeTimestamp: first.time,
    limit: 1_000,
    priority: "user",
    signal,
  });
  const completed = completedCandles(older, session.interval, now);
  const merged = mergeCandles(completed, session.candles.map(stripValuation));

  return sessionFromSelection({
    mint: session.mint,
    token: session.token,
    basis: session.basis,
    candidates: session.candidates,
    market: session.market,
    candles: merged,
    interval: session.interval,
    limitedHistory: !hasAdequateHistory(
      merged,
      session.market,
      session.interval,
      now,
    ),
    rejected: session.rejected,
    now,
  });
}

async function selectReferenceMarket(
  provider: GeckoTerminalProvider,
  candidates: GeckoPoolCandidate[],
  signal: AbortSignal,
  now: number,
): Promise<{
  market: GeckoPoolCandidate;
  candles: GeckoCandle[];
  limitedHistory: boolean;
  rejected: CandidateRejection[];
}> {
  const rejected: CandidateRejection[] = [];
  let firstUsable:
    { market: GeckoPoolCandidate; candles: GeckoCandle[] } | undefined;

  for (const market of candidates.slice(0, 3)) {
    const result = await probeCandidate(
      provider,
      market,
      "15m",
      signal,
      now,
      "speculative",
    );
    if (!result.usable) {
      rejected.push({
        address: market.address,
        name: market.name,
        reason: result.reason,
      });
      continue;
    }
    if (result.adequate) {
      if (firstUsable) {
        rejected.unshift({
          address: firstUsable.market.address,
          name: firstUsable.market.name,
          reason: "Usable candles, but less than the default history window.",
        });
      }
      return {
        market,
        candles: result.candles,
        limitedHistory: false,
        rejected,
      };
    }
    if (!firstUsable) {
      firstUsable = { market, candles: result.candles };
    } else {
      rejected.push({
        address: market.address,
        name: market.name,
        reason: "Usable candles, but less than the default history window.",
      });
    }
  }

  if (firstUsable) {
    return {
      ...firstUsable,
      limitedHistory: true,
      rejected,
    };
  }

  throw new NoReferenceMarketError(
    "The top three GeckoTerminal markets did not provide usable completed candles.",
    candidates,
  );
}

type ProbeResult =
  | { usable: true; adequate: boolean; candles: GeckoCandle[] }
  | { usable: false; reason: string };

async function probeCandidate(
  provider: GeckoTerminalProvider,
  market: GeckoPoolCandidate,
  interval: CandleInterval,
  signal: AbortSignal,
  now: number,
  priority: PublicRequestPriority,
): Promise<ProbeResult> {
  try {
    const candles = completedCandles(
      await provider.getCandles(market, interval, {
        limit: 1_000,
        priority,
        signal,
      }),
      interval,
      now,
    );
    if (candles.length === 0) {
      return {
        usable: false,
        reason: "No completed USD candles were returned.",
      };
    }
    return {
      usable: true,
      adequate: hasAdequateHistory(candles, market, interval, now),
      candles,
    };
  } catch (error) {
    if (signal.aborted) throw error;
    if (!(error instanceof GeckoTerminalError) || error.kind !== "not-found") {
      throw error;
    }
    return {
      usable: false,
      reason: error instanceof Error ? error.message : "Candle request failed.",
    };
  }
}

export async function resolveValuationBasis(
  token: GeckoTokenMetadata,
  rpc: ReadOnlySolanaRpc | undefined,
  mint: string,
  signal: AbortSignal,
): Promise<ValuationBasis> {
  if (token.marketCapUsd && token.priceUsd) {
    const displaySupply = token.marketCapUsd / token.priceUsd;
    if (Number.isFinite(displaySupply) && displaySupply > 0)
      return {
        kind: "market-cap",
        label: "Market Cap (USD)",
        source: "CoinGecko verified",
        displaySupply,
        observedAt: token.observedAt,
      };
  }

  if (rpc) {
    try {
      const response = await rpc.getTokenSupply<TokenSupplyResponse>(
        mint,
        signal,
      );
      const displaySupply = decimalAmount(
        response.value.amount,
        response.value.decimals,
      );
      if (displaySupply > 0) {
        return {
          kind: "fdv",
          label: "FDV (USD)",
          source: "current Solana mint supply",
          displaySupply,
          observedAt: Date.now(),
        };
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }

  return {
    kind: "price",
    label: "Price (USD)",
    source: "GeckoTerminal",
    displaySupply: 1,
    observedAt: token.observedAt,
    reason: rpc
      ? "Current mint supply is unavailable."
      : "Connect an RPC to resolve current mint supply.",
  };
}

function sessionFromSelection({
  mint,
  token,
  basis,
  candidates,
  market,
  candles,
  interval,
  limitedHistory,
  rejected,
  now,
}: Omit<ReferenceMarketSession, "candles" | "freshness" | "observedAt"> & {
  candles: GeckoCandle[];
  now: number;
}): ReferenceMarketSession {
  return {
    mint,
    token,
    basis,
    candidates,
    market,
    candles: applyValuation(candles, basis),
    interval,
    limitedHistory,
    freshness: describeFreshness(candles, market, interval, now),
    rejected,
    observedAt: now,
  };
}

export function applyValuation(
  candles: GeckoCandle[],
  basis: ValuationBasis,
): ValuationCandle[] {
  if (!Number.isFinite(basis.displaySupply) || basis.displaySupply <= 0)
    throw new Error("Reference-market valuation has an invalid supply basis.");
  return candles.map((candle) => {
    const values = [candle.open, candle.high, candle.low, candle.close].map(
      (price) => price * basis.displaySupply,
    );
    if (values.some((value) => !Number.isFinite(value) || value <= 0))
      throw new Error(
        "Reference-market valuation exceeds the supported numeric range.",
      );
    return {
      ...candle,
      priceOpen: candle.open,
      priceHigh: candle.high,
      priceLow: candle.low,
      priceClose: candle.close,
      open: values[0]!,
      high: values[1]!,
      low: values[2]!,
      close: values[3]!,
    };
  });
}

export function describeFreshness(
  candles: GeckoCandle[],
  market: GeckoPoolCandidate,
  interval: CandleInterval,
  now: number,
): Freshness {
  const newest = candles.at(-1);
  if (!newest) return { state: "unknown", detail: "No completed candle." };

  const seconds = intervalSeconds(interval);
  const newestEnd = newest.time + seconds;
  if (market.lastTradeTimestamp) {
    const lag = Math.max(0, market.lastTradeTimestamp - newestEnd);
    return lag > seconds * 2
      ? {
          state: "delayed",
          detail: `Newest candle trails the reported last trade by ${formatDuration(lag)}.`,
        }
      : { state: "current", detail: "Candle and reported trade times align." };
  }

  if (market.recentTrades !== undefined && market.recentTrades > 0) {
    const age = Math.max(0, Math.floor(now / 1_000) - newestEnd);
    return age > seconds * 2 + 300
      ? {
          state: "delayed",
          detail: `Recent activity is reported, but the newest candle is ${formatDuration(age)} old.`,
        }
      : { state: "current", detail: "Recent activity and candle time align." };
  }

  return {
    state: "unknown",
    detail: "No last-trade or recent-activity signal is available.",
  };
}

function completedCandles(
  candles: GeckoCandle[],
  interval: CandleInterval,
  now: number,
): GeckoCandle[] {
  const nowSeconds = Math.floor(now / 1_000);
  const seconds = intervalSeconds(interval);
  return candles.filter((candle) => candle.time + seconds <= nowSeconds);
}

function hasAdequateHistory(
  candles: GeckoCandle[],
  market: GeckoPoolCandidate,
  interval: CandleInterval,
  now: number,
): boolean {
  const first = candles[0];
  const last = candles.at(-1);
  if (!first || !last) return false;
  const coverage = last.time - first.time + intervalSeconds(interval);
  if (coverage >= ADEQUATE_HISTORY_SECONDS) return true;

  const nowSeconds = Math.floor(now / 1_000);
  const poolAge = market.createdAt ? nowSeconds - market.createdAt : Infinity;
  return (
    market.createdAt !== undefined &&
    poolAge >= 0 &&
    poolAge <= DEFAULT_HISTORY_SECONDS &&
    first.time <= market.createdAt + intervalSeconds(interval) * 2
  );
}

function mergeCandles(...sets: GeckoCandle[][]): GeckoCandle[] {
  const byTime = new Map<number, GeckoCandle>();
  for (const candle of sets.flat()) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function stripValuation(candle: ValuationCandle): GeckoCandle {
  return {
    time: candle.time,
    open: candle.priceOpen,
    high: candle.priceHigh,
    low: candle.priceLow,
    close: candle.priceClose,
    volume: candle.volume,
  };
}

function decimalAmount(amount: string, decimals: number): number {
  if (
    !isSupportedSplAmount(amount) ||
    !isSafeIntegerInRange(decimals, 0, MAX_SPL_DECIMALS)
  ) {
    return 0;
  }
  const padded = amount.padStart(decimals + 1, "0");
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction = decimals === 0 ? "" : `.${padded.slice(-decimals)}`;
  const value = Number(`${whole}${fraction}`);
  return Number.isFinite(value) ? value : 0;
}

function formatDuration(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} seconds`;
  if (seconds < 7_200) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3_600)} hours`;
}
