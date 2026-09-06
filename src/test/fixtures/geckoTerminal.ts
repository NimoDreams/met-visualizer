import type {
  GeckoCandle,
  GeckoPoolCandidate,
  GeckoTokenMetadata,
} from "../../providers/geckoTerminal";

export const TOKEN_MINT = "So11111111111111111111111111111111111111112";
export const QUOTE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function tokenFixture(
  overrides: Partial<GeckoTokenMetadata> = {},
): GeckoTokenMetadata {
  return {
    address: TOKEN_MINT,
    name: "Fixture Token",
    symbol: "FIX",
    decimals: 6,
    priceUsd: 2,
    marketCapUsd: 2_000_000,
    observedAt: Date.UTC(2026, 8, 6),
    ...overrides,
  };
}

export function poolFixture(
  address: string,
  overrides: Partial<GeckoPoolCandidate> = {},
): GeckoPoolCandidate {
  return {
    address,
    name: "FIX / USDC",
    dexId: "meteora-dlmm",
    baseMint: TOKEN_MINT,
    quoteMint: QUOTE_MINT,
    tokenSide: "base",
    reserveUsd: 1_000_000,
    volume24hUsd: 500_000,
    lastTradeTimestamp: 1_789_200_000,
    recentTrades: 10,
    ...overrides,
  };
}

export function candleFixture(
  start: number,
  count: number,
  step = 900,
): GeckoCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 2 + index / 1_000;
    return {
      time: start + index * step,
      open: close - 0.01,
      high: close + 0.02,
      low: close - 0.02,
      close,
      volume: 1_000 + index,
    };
  });
}

export function tokenResponse(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    data: {
      id: `solana_${TOKEN_MINT}`,
      type: "token",
      attributes: {
        address: TOKEN_MINT,
        name: "Fixture Token",
        symbol: "FIX",
        decimals: 6,
        price_usd: "2",
        market_cap_usd: "2000000",
        ...overrides,
      },
    },
  };
}

export function poolResponse(
  address = "pool-one",
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    data: [
      {
        id: `solana_${address}`,
        type: "pool",
        attributes: {
          address,
          name: "FIX / USDC",
          reserve_in_usd: "1000000",
          pool_created_at: "2026-09-01T00:00:00Z",
          volume_usd: { h24: "500000" },
          transactions: { m5: { buys: 3, sells: 2 } },
          ...overrides,
        },
        relationships: {
          base_token: { data: { id: `solana_${TOKEN_MINT}` } },
          quote_token: { data: { id: `solana_${QUOTE_MINT}` } },
          dex: { data: { id: "meteora-dlmm" } },
        },
      },
    ],
  };
}

export function candleResponse(candles: GeckoCandle[]): unknown {
  return {
    data: {
      id: "fixture",
      type: "ohlcv_request_response",
      attributes: {
        ohlcv_list: candles.map((candle) => [
          candle.time,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
        ]),
      },
    },
  };
}
