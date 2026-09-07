import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  candleFixture,
  candleResponse,
  poolResponse,
  QUOTE_MINT,
  TOKEN_MINT,
  tokenResponse,
} from "../test/fixtures/geckoTerminal";
import {
  PublicGeckoTerminalProvider,
  GeckoTerminalError,
} from "./geckoTerminal";
import { PublicRequestBudget } from "./publicRequestBudget";
import { PUBLIC_JSON_MAX_BYTES } from "./http";
import {
  MAX_PUBLIC_CANDIDATES,
  MAX_PUBLIC_CANDLES,
  MAX_PUBLIC_QUOTE_MINTS,
} from "../domain/providerLimits";

describe("PublicGeckoTerminalProvider", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("parses token and ranked pool responses without credentials", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation((input) => {
      const url = requestUrl(input);
      const body = url.endsWith(`/tokens/${TOKEN_MINT}`)
        ? tokenResponse()
        : poolResponse();
      return Promise.resolve(Response.json(body));
    });
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());

    await expect(provider.getToken(TOKEN_MINT)).resolves.toMatchObject({
      address: TOKEN_MINT,
      symbol: "FIX",
      priceUsd: 2,
      marketCapUsd: 2_000_000,
    });
    await expect(provider.getPools(TOKEN_MINT)).resolves.toMatchObject([
      {
        address: "pool-one",
        baseMint: TOKEN_MINT,
        quoteMint: QUOTE_MINT,
        tokenSide: "base",
        dexId: "meteora-dlmm",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(requestUrl(url)).toMatch(/^https:\/\/api\.geckoterminal\.com\//);
      expect(init?.headers).toEqual({
        Accept: "application/json;version=20230203",
      });
      expect(init?.method).toBeUndefined();
    }
  });

  it("orients, deduplicates, and sorts USD candle tuples", async () => {
    const candles = candleFixture(1_700_000_000, 3);
    const newestFirstWithDuplicate = [
      candles[2]!,
      candles[1]!,
      { ...candles[1]!, close: 9 },
      candles[0]!,
    ];
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        Response.json(candleResponse(newestFirstWithDuplicate)),
      );
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());
    const pool = (await parseOnePool(provider))[0]!;

    const result = await provider.getCandles(pool, "15m", {
      beforeTimestamp: 1_700_100_000,
    });

    expect(result.map((candle) => candle.time)).toEqual([
      1_700_000_000, 1_700_000_900, 1_700_001_800,
    ]);
    expect(result[1]?.close).toBe(9);
    const url = requestUrl(fetchMock.mock.calls.at(-1)?.[0]);
    expect(url).toContain("/ohlcv/minute?");
    expect(url).toContain("aggregate=15");
    expect(url).toContain("currency=usd");
    expect(url).toContain("token=base");
    expect(url).toContain("before_timestamp=1700100000");
  });

  it("shares a cached quote-price boundary for later position valuation", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockImplementation(() =>
      Promise.resolve(
        Response.json({
          data: {
            id: "fixture",
            type: "simple_token_price",
            attributes: { token_prices: { [QUOTE_MINT]: "1.002" } },
          },
        }),
      ),
    );
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());

    const first = provider.getQuotePrices([QUOTE_MINT, QUOTE_MINT]);
    const second = provider.getQuotePrices([QUOTE_MINT]);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.get(QUOTE_MINT)?.priceUsd).toBe(1.002);
    expect(firstResult.get(QUOTE_MINT)?.priceUsdExact).toBe("1.002");
    expect(secondResult.get(QUOTE_MINT)?.priceUsd).toBe(1.002);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await provider.getQuotePrices([QUOTE_MINT], { fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies provider schema changes and rate limits distinctly", async () => {
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(Response.json({ data: [] }));
    await expect(provider.getToken(TOKEN_MINT)).rejects.toMatchObject({
      kind: "shape",
    } satisfies Partial<GeckoTerminalError>);

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "1" } }),
    );
    await expect(provider.getPools(TOKEN_MINT)).rejects.toMatchObject({
      kind: "rate-limit",
      status: 429,
    } satisfies Partial<GeckoTerminalError>);
  });

  it("surfaces an oversized public response as a redacted shape error", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response("{}", {
        headers: { "Content-Length": String(PUBLIC_JSON_MAX_BYTES + 1) },
      }),
    );
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());

    await expect(provider.getToken(TOKEN_MINT)).rejects.toMatchObject({
      kind: "shape",
      message: "GeckoTerminal response exceeded the safe size limit.",
    } satisfies Partial<GeckoTerminalError>);
  });

  it("enforces candidate and candle row limits before parsing rows", async () => {
    const row = (poolResponse() as { data: unknown[] }).data[0];
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        Response.json({ data: Array(MAX_PUBLIC_CANDIDATES).fill(row) }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: Array(MAX_PUBLIC_CANDIDATES + 1).fill(row) }),
      );
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());
    await expect(provider.getPools(TOKEN_MINT)).resolves.toHaveLength(
      MAX_PUBLIC_CANDIDATES,
    );
    await expect(
      new PublicGeckoTerminalProvider(new PublicRequestBudget()).getPools(
        TOKEN_MINT,
      ),
    ).rejects.toMatchObject({ kind: "shape" });

    const pool = (await parseOnePool(provider))[0]!;
    fetchMock.mockResolvedValueOnce(
      Response.json(
        candleResponse(candleFixture(1_700_000_000, MAX_PUBLIC_CANDLES + 1)),
      ),
    );
    await expect(provider.getCandles(pool, "15m")).rejects.toMatchObject({
      kind: "shape",
    });
  });

  it("rejects out-of-range request bounds before issuing a public request", async () => {
    const fetchMock = vi.spyOn(window, "fetch");
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());
    const pool = {
      address: "pool",
      name: "pool",
      dexId: "dex",
      baseMint: TOKEN_MINT,
      quoteMint: QUOTE_MINT,
      tokenSide: "base" as const,
    };

    await expect(
      provider.getCandles(pool, "15m", { limit: MAX_PUBLIC_CANDLES + 1 }),
    ).rejects.toMatchObject({ kind: "shape" });
    await expect(
      provider.getQuotePrices(
        Array.from(
          { length: MAX_PUBLIC_QUOTE_MINTS + 1 },
          (_, index) => `mint-${index}`,
        ),
      ),
    ).rejects.toMatchObject({ kind: "shape" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the candle and quote-mint boundaries", async () => {
    const mints = Array.from(
      { length: MAX_PUBLIC_QUOTE_MINTS },
      (_, index) => `mint-${index}`,
    );
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          candleResponse(candleFixture(1_700_000_000, MAX_PUBLIC_CANDLES)),
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            attributes: {
              token_prices: Object.fromEntries(
                mints.map((mint) => [mint, "1"]),
              ),
            },
          },
        }),
      );
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());
    const pool = {
      address: "pool",
      name: "pool",
      dexId: "dex",
      baseMint: TOKEN_MINT,
      quoteMint: QUOTE_MINT,
      tokenSide: "base" as const,
    };

    await expect(
      provider.getCandles(pool, "15m", { limit: MAX_PUBLIC_CANDLES }),
    ).resolves.toHaveLength(MAX_PUBLIC_CANDLES);
    await expect(provider.getQuotePrices(mints)).resolves.toHaveLength(
      MAX_PUBLIC_QUOTE_MINTS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects overlong labels, decimals, decimal text, and future times", async () => {
    const overlongDexResponse = poolResponse() as {
      data: Array<{
        relationships: { dex: { data: { id: string } } };
      }>;
    };
    overlongDexResponse.data[0]!.relationships.dex.data.id = "D".repeat(65);
    const invalidResponses = [
      tokenResponse({ name: "😀".repeat(257) }),
      tokenResponse({ symbol: "S".repeat(65) }),
      tokenResponse({ decimals: 256 }),
      tokenResponse({ price_usd: "9".repeat(97) }),
      tokenResponse({ price_usd: 0 }),
      overlongDexResponse,
      candleResponse([
        {
          ...candleFixture(1_700_000_000, 1)[0]!,
          time: Math.floor(Date.now() / 1_000) + 24 * 60 * 60 + 1,
        },
      ]),
    ];

    for (const [index, response] of invalidResponses.entries()) {
      vi.spyOn(window, "fetch").mockResolvedValueOnce(Response.json(response));
      const provider = new PublicGeckoTerminalProvider(
        new PublicRequestBudget(),
      );
      const request =
        index < 5
          ? provider.getToken(TOKEN_MINT)
          : index === 5
            ? provider.getPools(TOKEN_MINT)
            : provider.getCandles(
                {
                  address: "pool",
                  name: "pool",
                  dexId: "dex",
                  baseMint: TOKEN_MINT,
                  quoteMint: QUOTE_MINT,
                  tokenSide: "base",
                },
                "15m",
              );
      await expect(request).rejects.toMatchObject({ kind: "shape" });
      vi.restoreAllMocks();
    }
  });
});

async function parseOnePool(provider: PublicGeckoTerminalProvider) {
  vi.spyOn(window, "fetch").mockResolvedValueOnce(
    Response.json(poolResponse()),
  );
  return provider.getPools(TOKEN_MINT);
}

function requestUrl(input: string | URL | Request | undefined): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}
