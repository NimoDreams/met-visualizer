import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase58 } from "../domain/base58";
import oracle from "../test/fixtures/lbPairOracle.json";
import {
  MeteoraMetadataError,
  PublicMeteoraMetadataProvider,
} from "./meteoraMetadata";
import { MAX_PROVIDER_PAGINATION_TOTAL } from "../domain/providerLimits";

const JUP = oracle.expected.tokenXMint;
const SOL = oracle.expected.tokenYMint;

describe("PublicMeteoraMetadataProvider", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the keyless browser request shape and parses current metadata", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        Response.json(
          pageResponse([
            poolRow(oracle.address, 42_000, 7_500),
            poolRow(address(8), 11_000, 900),
          ]),
        ),
      );
    const provider = new PublicMeteoraMetadataProvider();

    await expect(provider.getPoolPage(JUP, "x", 1)).resolves.toMatchObject({
      orientation: "x",
      currentPage: 1,
      exhausted: true,
      frontierTvlUsd: 11_000,
      pools: [
        expect.objectContaining({
          address: oracle.address,
          tokenXMint: JUP,
          tokenYMint: SOL,
          tvlUsd: 42_000,
          volume24hUsd: 7_500,
        }),
        expect.objectContaining({ address: address(8) }),
      ],
    });

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const request = requestUrl(input);
    expect(request).toMatch(/^https:\/\/dlmm\.datapi\.meteora\.ag\/pools\?/);
    const url = new URL(request);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      filter_by: `token_x=${JUP}`,
      sort_by: "tvl:desc",
      page_size: "20",
      page: "1",
    });
    expect(init?.headers).toEqual({ Accept: "application/json" });
  });

  it("fails closed on non-monotonic or truncated provider pages", async () => {
    const provider = new PublicMeteoraMetadataProvider();
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          pageResponse([
            poolRow(oracle.address, 1, 1),
            poolRow(address(8), 2, 1),
          ]),
        ),
      );
    await expect(provider.getPoolPage(JUP, "x", 1)).rejects.toMatchObject({
      kind: "shape",
    } satisfies Partial<MeteoraMetadataError>);

    fetchMock.mockResolvedValueOnce(
      Response.json({
        current_page: 1,
        pages: 2,
        page_size: 20,
        total: 21,
        data: [poolRow(oracle.address, 1, 1)],
      }),
    );
    await expect(provider.getPoolPage(JUP, "x", 1)).rejects.toThrow(
      /truncated/i,
    );
  });

  it("rejects a final page inconsistent with its total and page size", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        current_page: 2,
        pages: 2,
        page_size: 20,
        total: 21,
        data: [poolRow(oracle.address, 1, 1), poolRow(address(8), 1, 1)],
      }),
    );

    await expect(
      new PublicMeteoraMetadataProvider().getPoolPage(JUP, "x", 2),
    ).rejects.toThrow(/final pool page/i);
  });

  it("rejects a row whose orientation does not contain the requested mint", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        pageResponse([
          {
            ...poolRow(oracle.address, 1, 1),
            token_x: { address: address(9), symbol: "WRONG" },
          },
        ]),
      ),
    );

    await expect(
      new PublicMeteoraMetadataProvider().getPoolPage(JUP, "x", 1),
    ).rejects.toThrow(/orientation/i);
  });

  it("accepts the pagination ceiling and rejects its N+1 and unsafe values", async () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      poolRow(address(index + 20), 20 - index, 1),
    );
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          current_page: 1,
          pages: 5_000,
          page_size: 20,
          total: MAX_PROVIDER_PAGINATION_TOTAL,
          data: rows,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          current_page: 1,
          pages: 5_001,
          page_size: 20,
          total: MAX_PROVIDER_PAGINATION_TOTAL + 1,
          data: rows,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          current_page: Number.MAX_SAFE_INTEGER + 1,
          pages: 1,
          page_size: 20,
          total: 1,
          data: [poolRow(oracle.address, 1, 1)],
        }),
      );

    await expect(
      new PublicMeteoraMetadataProvider().getPoolPage(JUP, "x", 1),
    ).resolves.toMatchObject({ total: MAX_PROVIDER_PAGINATION_TOTAL });
    await expect(
      new PublicMeteoraMetadataProvider().getPoolPage(JUP, "x", 1),
    ).rejects.toMatchObject({ kind: "shape" });
    await expect(
      new PublicMeteoraMetadataProvider().getPoolPage(JUP, "x", 1),
    ).rejects.toMatchObject({ kind: "shape" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects overlong names, symbols, and bounded decimal violations", async () => {
    const invalidRows = [
      { ...poolRow(oracle.address, 1, 1), name: "😀".repeat(257) },
      {
        ...poolRow(oracle.address, 1, 1),
        token_x: { address: JUP, symbol: "S".repeat(65) },
      },
      { ...poolRow(oracle.address, 1, 1), tvl: "9".repeat(97) },
      { ...poolRow(oracle.address, 1, 1), tvl: "1e101" },
      { ...poolRow(oracle.address, 1, 1), tvl: -1 },
    ];

    for (const row of invalidRows) {
      vi.spyOn(window, "fetch").mockResolvedValueOnce(
        Response.json(pageResponse([row])),
      );
      await expect(
        new PublicMeteoraMetadataProvider().getPoolPage(JUP, "x", 1),
      ).rejects.toMatchObject({ kind: "shape" });
      vi.restoreAllMocks();
    }
  });
});

function pageResponse(data: unknown[]) {
  return {
    current_page: 1,
    pages: 1,
    page_size: 20,
    total: data.length,
    data,
  };
}

function poolRow(poolAddress: string, tvl: number, volume24h: number) {
  return {
    address: poolAddress,
    name: "JUP-SOL",
    token_x: { address: JUP, symbol: "JUP" },
    token_y: { address: SOL, symbol: "SOL" },
    tvl,
    volume: { "24h": volume24h },
    is_blacklisted: false,
  };
}

function address(seed: number): string {
  return encodeBase58(new Uint8Array(32).fill(seed));
}

function requestUrl(input: string | URL | Request | undefined): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}
