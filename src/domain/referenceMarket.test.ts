import { describe, expect, it, vi } from "vitest";
import {
  candleFixture,
  poolFixture,
  TOKEN_MINT,
  tokenFixture,
} from "../test/fixtures/geckoTerminal";
import type {
  CandleInterval,
  GeckoCandle,
  GeckoPoolCandidate,
  GeckoTerminalProvider,
} from "../providers/geckoTerminal";
import type { PublicRequestPriority } from "../providers/publicRequestBudget";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import {
  applyValuation,
  loadMarketCandles,
  loadOlderCandles,
  loadReferenceMarket,
  NoReferenceMarketError,
  resolveValuationBasis,
} from "./referenceMarket";

const NOW = 1_800_000_000_000;
const NOW_SECONDS = NOW / 1_000;

describe("reference-market selection", () => {
  it("skips a thin leading market and chooses the next adequate market", async () => {
    const thin = poolFixture("thin-pool");
    const established = poolFixture("established-pool");
    const provider = fixtureProvider({
      pools: [thin, established],
      candles: new Map([
        [thin.address, candleFixture(NOW_SECONDS - 3_600, 4)],
        [established.address, candleFixture(NOW_SECONDS - 24 * 3_600, 96)],
      ]),
    });

    const session = await loadReferenceMarket(
      provider,
      undefined,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );

    expect(session.market.address).toBe("established-pool");
    expect(session.limitedHistory).toBe(false);
    expect(session.rejected).toEqual([
      expect.objectContaining({ address: "thin-pool" }),
    ]);
    expect(session.basis.kind).toBe("market-cap");
    expect(typeof session.candles.at(-1)?.priceClose).toBe("number");
    expect(typeof session.candles.at(-1)?.close).toBe("number");
    expect(session.candles.at(-1)?.close).toBe(
      session.candles.at(-1)!.priceClose * 1_000_000,
    );
    expect(session.candles.at(-1)?.volume).toBe(1_095);
  });

  it("accepts a new market's available lifetime as adequate", async () => {
    const createdAt = NOW_SECONDS - 2 * 3_600;
    const market = poolFixture("new-pool", { createdAt });
    const provider = fixtureProvider({
      pools: [market],
      candles: new Map([[market.address, candleFixture(createdAt + 900, 7)]]),
    });

    const session = await loadReferenceMarket(
      provider,
      undefined,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );

    expect(session.market.address).toBe("new-pool");
    expect(session.limitedHistory).toBe(false);
  });

  it("uses current RPC mint supply for FDV and preserves raw volume", async () => {
    const market = poolFixture("fdv-pool");
    const provider = fixtureProvider({
      token: tokenFixture({ marketCapUsd: undefined }),
      pools: [market],
      candles: new Map([
        [market.address, candleFixture(NOW_SECONDS - 24 * 3_600, 96)],
      ]),
    });
    const rpc = fixtureRpc({
      value: { amount: "123456789", decimals: 3 },
    });

    const session = await loadReferenceMarket(
      provider,
      rpc,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );

    expect(session.basis).toMatchObject({
      kind: "fdv",
      displaySupply: 123_456.789,
    });
    expect(session.candles[0]?.volume).toBe(1_000);
    expect(session.candles[0]?.close).toBeCloseTo(2 * 123_456.789);
  });

  it("falls back to Price when current supply is unavailable", async () => {
    const market = poolFixture("price-pool");
    const provider = fixtureProvider({
      token: tokenFixture({ marketCapUsd: undefined }),
      pools: [market],
      candles: new Map([
        [market.address, candleFixture(NOW_SECONDS - 24 * 3_600, 96)],
      ]),
    });
    const rpc = fixtureRpc(undefined, new Error("unavailable"));

    const session = await loadReferenceMarket(
      provider,
      rpc,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );

    expect(session.basis).toMatchObject({ kind: "price", displaySupply: 1 });
    expect(session.candles[0]?.close).toBe(session.candles[0]?.priceClose);
  });

  it("accepts bounded u64 supply and rejects amount or decimal overflow", async () => {
    const token = tokenFixture({ marketCapUsd: undefined });
    const signal = new AbortController().signal;
    await expect(
      resolveBasis(token, {
        value: { amount: "18446744073709551615", decimals: 255 },
      }),
    ).resolves.toMatchObject({ kind: "fdv" });

    for (const value of [
      { amount: "18446744073709551616", decimals: 0 },
      { amount: "1".repeat(21), decimals: 0 },
      { amount: "1", decimals: 256 },
      { amount: "1", decimals: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const result = await resolveBasis(token, { value });
      expect(result).toMatchObject({ kind: "price" });
    }

    async function resolveBasis(
      currentToken: ReturnType<typeof tokenFixture>,
      response: { value: { amount: string; decimals: number } },
    ) {
      const rpc = fixtureRpc(response);
      return resolveValuationBasis(currentToken, rpc, TOKEN_MINT, signal);
    }
  });

  it("rejects non-finite market-cap normalization and FDV products", async () => {
    const token = tokenFixture({ priceUsd: 1e-308, marketCapUsd: 1e308 });
    await expect(
      resolveValuationBasis(
        token,
        undefined,
        TOKEN_MINT,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ kind: "price" });

    expect(() =>
      applyValuation(candleFixture(NOW_SECONDS - 900, 1), {
        kind: "fdv",
        label: "FDV (USD)",
        source: "current Solana mint supply",
        displaySupply: 1e308,
        observedAt: NOW,
      }),
    ).toThrow(/supported numeric range/i);
  });

  it("uses a limited-history fallback and reports no usable market distinctly", async () => {
    const thin = poolFixture("thin-only");
    const thinProvider = fixtureProvider({
      pools: [thin],
      candles: new Map([[thin.address, candleFixture(NOW_SECONDS - 3_600, 4)]]),
    });
    const limited = await loadReferenceMarket(
      thinProvider,
      undefined,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );
    expect(limited.limitedHistory).toBe(true);

    const emptyProvider = fixtureProvider({
      pools: [thin],
      candles: new Map([[thin.address, []]]),
    });
    await expect(
      loadReferenceMarket(
        emptyProvider,
        undefined,
        TOKEN_MINT,
        new AbortController().signal,
        NOW,
      ),
    ).rejects.toBeInstanceOf(NoReferenceMarketError);
  });

  it("keeps the market stable across refresh and changes only on explicit selection", async () => {
    const first = poolFixture("first-pool");
    const second = poolFixture("second-pool");
    const candles = candleFixture(NOW_SECONDS - 24 * 3_600, 96);
    const provider = fixtureProvider({
      pools: [first, second],
      candles: new Map([
        [first.address, candles],
        [second.address, candles],
      ]),
    });
    const initial = await loadReferenceMarket(
      provider,
      undefined,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );

    const refreshed = await loadMarketCandles(
      provider,
      initial,
      initial.market,
      "15m",
      new AbortController().signal,
      "selected",
      NOW,
    );
    expect(refreshed.market.address).toBe("first-pool");

    const changed = await loadMarketCandles(
      provider,
      refreshed,
      second,
      "1h",
      new AbortController().signal,
      "user",
      NOW,
    );
    expect(changed.market.address).toBe("second-pool");
    expect(changed.interval).toBe("1h");
  });

  it("backfills, deduplicates, and keeps candles in time order", async () => {
    const market = poolFixture("backfill-pool");
    const recent = candleFixture(NOW_SECONDS - 24 * 3_600, 96);
    const older = candleFixture(recent[0]!.time - 1_800, 3);
    older[2] = { ...recent[0]! };
    const provider = fixtureProvider({
      pools: [market],
      candles: new Map([[market.address, recent]]),
      older,
    });
    const initial = await loadReferenceMarket(
      provider,
      undefined,
      TOKEN_MINT,
      new AbortController().signal,
      NOW,
    );
    const backfilled = await loadOlderCandles(
      provider,
      initial,
      new AbortController().signal,
      NOW,
    );

    expect(backfilled.candles).toHaveLength(recent.length + 2);
    expect(backfilled.candles[0]?.time).toBe(older[0]?.time);
  });
});

function fixtureProvider({
  token = tokenFixture(),
  pools,
  candles,
  older,
}: {
  token?: ReturnType<typeof tokenFixture>;
  pools: GeckoPoolCandidate[];
  candles: Map<string, GeckoCandle[]>;
  older?: GeckoCandle[];
}): GeckoTerminalProvider {
  return {
    getToken: vi.fn(() => Promise.resolve(token)),
    getPools: vi.fn(() => Promise.resolve(pools)),
    getCandles: vi.fn(
      (
        pool: GeckoPoolCandidate,
        _interval: CandleInterval,
        options?: {
          beforeTimestamp?: number;
          limit?: number;
          priority?: PublicRequestPriority;
          signal?: AbortSignal;
        },
      ) =>
        Promise.resolve(
          options?.beforeTimestamp && older
            ? older
            : (candles.get(pool.address) ?? []),
        ),
    ),
    getQuotePrices: vi.fn(() => Promise.resolve(new Map())),
  };
}

function fixtureRpc(result?: unknown, error?: Error): ReadOnlySolanaRpc {
  const getTokenSupply = vi.fn(() =>
    error ? Promise.reject(error) : Promise.resolve(result),
  );
  return {
    getTokenSupply: <T>() => getTokenSupply() as Promise<T>,
    getProgramAccounts: vi.fn(),
    getMultipleAccounts: vi.fn(),
    getProgramAccountsV2: vi.fn(),
  };
}
