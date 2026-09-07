import { ProviderRequestError, requestJson } from "./http";
import { BoundedTtlCache } from "./boundedCache";
import {
  sharedPublicRequestBudget,
  type PublicRequestBudget,
  type PublicRequestPriority,
} from "./publicRequestBudget";

const GECKO_TERMINAL_BASE =
  "https://api.geckoterminal.com/api/v2/networks/solana";
const GECKO_TERMINAL_SIMPLE_BASE =
  "https://api.geckoterminal.com/api/v2/simple/networks/solana";
const CACHE_MS = 60_000;

export type GeckoErrorKind =
  "rate-limit" | "not-found" | "network" | "provider" | "shape";

export class GeckoTerminalError extends Error {
  constructor(
    readonly kind: GeckoErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeckoTerminalError";
  }
}

export type CandleInterval = "5m" | "15m" | "1h" | "4h";

export type GeckoTokenMetadata = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  priceUsd?: number;
  marketCapUsd?: number;
  observedAt: number;
};

export type GeckoPoolCandidate = {
  address: string;
  name: string;
  dexId: string;
  baseMint: string;
  quoteMint: string;
  tokenSide: "base" | "quote";
  reserveUsd?: number;
  volume24hUsd?: number;
  createdAt?: number;
  lastTradeTimestamp?: number;
  recentTrades?: number;
};

export type GeckoCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type QuotePrice = {
  mint: string;
  priceUsd: number;
  priceUsdExact?: string;
  observedAt: number;
};

export interface GeckoTerminalProvider {
  getToken(mint: string, signal?: AbortSignal): Promise<GeckoTokenMetadata>;
  getPools(mint: string, signal?: AbortSignal): Promise<GeckoPoolCandidate[]>;
  getCandles(
    pool: GeckoPoolCandidate,
    interval: CandleInterval,
    options?: {
      beforeTimestamp?: number;
      limit?: number;
      priority?: PublicRequestPriority;
      signal?: AbortSignal;
    },
  ): Promise<GeckoCandle[]>;
  getQuotePrices(
    mints: readonly string[],
    options?: {
      priority?: PublicRequestPriority;
      signal?: AbortSignal;
      fresh?: boolean;
    },
  ): Promise<Map<string, QuotePrice>>;
}

export class PublicGeckoTerminalProvider implements GeckoTerminalProvider {
  #cache = new BoundedTtlCache<unknown>();

  constructor(
    private readonly budget: PublicRequestBudget = sharedPublicRequestBudget,
  ) {}

  async getToken(
    mint: string,
    signal?: AbortSignal,
  ): Promise<GeckoTokenMetadata> {
    const response = await this.#read(
      `${GECKO_TERMINAL_BASE}/tokens/${encodeURIComponent(mint)}`,
      `token:${mint}`,
      "standard",
      signal,
      CACHE_MS,
    );
    const attributes = dataAttributes(response);
    const address = requiredString(attributes.address, "token address");

    if (address !== mint) {
      throw shapeError(
        "Token response address does not match the requested CA.",
      );
    }

    return {
      address,
      name: requiredString(attributes.name, "token name"),
      symbol: requiredString(attributes.symbol, "token symbol"),
      decimals: requiredInteger(attributes.decimals, "token decimals"),
      priceUsd: optionalPositiveNumber(attributes.price_usd),
      marketCapUsd: optionalPositiveNumber(attributes.market_cap_usd),
      observedAt: Date.now(),
    };
  }

  async getPools(
    mint: string,
    signal?: AbortSignal,
  ): Promise<GeckoPoolCandidate[]> {
    const query = new URLSearchParams({
      include: "base_token,quote_token,dex",
      page: "1",
    });
    const response = await this.#read(
      `${GECKO_TERMINAL_BASE}/tokens/${encodeURIComponent(mint)}/pools?${query.toString()}`,
      `pools:${mint}`,
      "standard",
      signal,
      30_000,
    );

    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw shapeError("Pool response is missing its data list.");
    }

    return response.data.map((item, index) => parsePool(item, mint, index));
  }

  async getCandles(
    pool: GeckoPoolCandidate,
    interval: CandleInterval,
    options: {
      beforeTimestamp?: number;
      limit?: number;
      priority?: PublicRequestPriority;
      signal?: AbortSignal;
    } = {},
  ): Promise<GeckoCandle[]> {
    const { timeframe, aggregate } = intervalRequest(interval);
    const query = new URLSearchParams({
      aggregate,
      limit: String(options.limit ?? 1_000),
      currency: "usd",
      token: pool.tokenSide,
    });
    if (options.beforeTimestamp !== undefined) {
      query.set("before_timestamp", String(options.beforeTimestamp));
    }

    const response = await this.#read(
      `${GECKO_TERMINAL_BASE}/pools/${encodeURIComponent(pool.address)}/ohlcv/${timeframe}?${query.toString()}`,
      `candles:${pool.address}:${interval}:${options.beforeTimestamp ?? "latest"}`,
      options.priority ?? "speculative",
      options.signal,
      0,
    );
    const attributes = dataAttributes(response);

    if (!Array.isArray(attributes.ohlcv_list)) {
      throw shapeError("Candle response is missing its OHLCV list.");
    }

    const unique = new Map<number, GeckoCandle>();
    for (const [index, row] of attributes.ohlcv_list.entries()) {
      const candle = parseCandle(row, index);
      unique.set(candle.time, candle);
    }
    return [...unique.values()].sort((left, right) => left.time - right.time);
  }

  async getQuotePrices(
    mints: readonly string[],
    options: {
      priority?: PublicRequestPriority;
      signal?: AbortSignal;
      fresh?: boolean;
    } = {},
  ): Promise<Map<string, QuotePrice>> {
    const uniqueMints = [...new Set(mints)].sort();
    if (uniqueMints.length === 0) return new Map();

    const response = await this.#read(
      `${GECKO_TERMINAL_SIMPLE_BASE}/token_price/${uniqueMints.map(encodeURIComponent).join(",")}`,
      `quotes:${options.fresh ? "fresh:" : ""}${uniqueMints.join(",")}`,
      options.priority ?? "user",
      options.signal,
      options.fresh ? 0 : CACHE_MS,
    );
    const attributes = dataAttributes(response);
    if (!isRecord(attributes.token_prices)) {
      throw shapeError("Quote-price response is missing token prices.");
    }

    const observedAt = Date.now();
    const prices = new Map<string, QuotePrice>();
    for (const mint of uniqueMints) {
      const rawPrice = attributes.token_prices[mint];
      const priceUsd = optionalPositiveNumber(rawPrice);
      if (priceUsd !== undefined)
        prices.set(mint, {
          mint,
          priceUsd,
          priceUsdExact:
            typeof rawPrice === "string" ? rawPrice : priceUsd.toString(),
          observedAt,
        });
    }
    return prices;
  }

  async #read(
    url: string,
    key: string,
    priority: PublicRequestPriority,
    signal: AbortSignal | undefined,
    cacheMs: number,
  ): Promise<unknown> {
    const cached = this.#cache.get(key);
    if (cached !== undefined) return cached;

    try {
      const value = await this.budget.schedule(
        (sharedSignal) =>
          requestJson<unknown>(url, {
            provider: "GeckoTerminal",
            signal: sharedSignal,
            init: {
              headers: { Accept: "application/json;version=20230203" },
            },
          }),
        { key, priority, signal },
      );
      if (cacheMs > 0) {
        const now = Date.now();
        this.#cache.set(key, value, now + cacheMs, now);
      }
      return value;
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (error.kind === "limit" || error.kind === "invalid-json") {
          throw new GeckoTerminalError("shape", error.message);
        }
        if (error.status === 429) {
          this.budget.defer(error.retryAfterMs ?? 60_000);
          throw new GeckoTerminalError(
            "rate-limit",
            "GeckoTerminal is rate limiting public requests. Try again shortly.",
            error.status,
          );
        }
        if (error.status === 404) {
          throw new GeckoTerminalError(
            "not-found",
            "GeckoTerminal has no data for this address.",
            error.status,
          );
        }
        if (error.status === undefined) {
          throw new GeckoTerminalError(
            "network",
            "GeckoTerminal could not be reached.",
          );
        }
        if (error.status >= 500) this.budget.defer(1_000);
        throw new GeckoTerminalError(
          "provider",
          `GeckoTerminal returned HTTP ${error.status}.`,
          error.status,
        );
      }
      throw error;
    }
  }
}

export const publicGeckoTerminalProvider = new PublicGeckoTerminalProvider();

function parsePool(
  value: unknown,
  mint: string,
  index: number,
): GeckoPoolCandidate {
  if (!isRecord(value) || !isRecord(value.attributes)) {
    throw shapeError(`Pool ${index + 1} has invalid attributes.`);
  }
  const attributes = value.attributes;
  const relationships = isRecord(value.relationships)
    ? value.relationships
    : undefined;
  const baseMint = relationshipAddress(relationships?.base_token, "base token");
  const quoteMint = relationshipAddress(
    relationships?.quote_token,
    "quote token",
  );
  const dexId = relationshipId(relationships?.dex, "DEX");
  const tokenSide =
    baseMint === mint ? "base" : quoteMint === mint ? "quote" : null;

  if (!tokenSide) {
    throw shapeError(`Pool ${index + 1} does not contain the requested token.`);
  }

  return {
    address: requiredString(attributes.address, "pool address"),
    name: requiredString(attributes.name, "pool name"),
    dexId,
    baseMint,
    quoteMint,
    tokenSide,
    reserveUsd: optionalPositiveNumber(attributes.reserve_in_usd),
    volume24hUsd: isRecord(attributes.volume_usd)
      ? optionalPositiveNumber(attributes.volume_usd.h24)
      : undefined,
    createdAt: optionalDateSeconds(attributes.pool_created_at),
    lastTradeTimestamp: optionalPositiveNumber(attributes.last_trade_timestamp),
    recentTrades: recentTradeCount(attributes.transactions),
  };
}

function parseCandle(value: unknown, index: number): GeckoCandle {
  if (!Array.isArray(value) || value.length !== 6) {
    throw shapeError(`Candle ${index + 1} has an invalid tuple.`);
  }
  const [time, open, high, low, close, volume] = value.map(Number);
  if (
    time === undefined ||
    open === undefined ||
    high === undefined ||
    low === undefined ||
    close === undefined ||
    volume === undefined ||
    !Number.isInteger(time) ||
    ![open, high, low, close, volume].every(Number.isFinite) ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    volume < 0
  ) {
    throw shapeError(`Candle ${index + 1} contains invalid values.`);
  }
  return { time, open, high, low, close, volume };
}

function dataAttributes(value: unknown): Record<string, unknown> {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !isRecord(value.data.attributes)
  ) {
    throw shapeError("Response is missing data attributes.");
  }
  return value.data.attributes;
}

function relationshipAddress(value: unknown, label: string): string {
  const id = relationshipId(value, label);
  const prefix = "solana_";
  if (!id.startsWith(prefix))
    throw shapeError(`${label} has an invalid network.`);
  return id.slice(prefix.length);
}

function relationshipId(value: unknown, label: string): string {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw shapeError(`Pool response is missing ${label} data.`);
  }
  return requiredString(value.data.id, `${label} id`);
}

function recentTradeCount(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["m5", "m15", "h1"]) {
    const window = value[key];
    if (!isRecord(window)) continue;
    const buys = Number(window.buys);
    const sells = Number(window.sells);
    if (Number.isFinite(buys) && Number.isFinite(sells)) return buys + sells;
  }
  return undefined;
}

function intervalRequest(interval: CandleInterval): {
  timeframe: "minute" | "hour";
  aggregate: string;
} {
  switch (interval) {
    case "5m":
      return { timeframe: "minute", aggregate: "5" };
    case "15m":
      return { timeframe: "minute", aggregate: "15" };
    case "1h":
      return { timeframe: "hour", aggregate: "1" };
    case "4h":
      return { timeframe: "hour", aggregate: "4" };
  }
}

export function intervalSeconds(interval: CandleInterval): number {
  return { "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400 }[interval];
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw shapeError(`Response has an invalid ${label}.`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw shapeError(`Response has an invalid ${label}.`);
  }
  return parsed;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalDateSeconds(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1_000) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shapeError(message: string): GeckoTerminalError {
  return new GeckoTerminalError("shape", message);
}
