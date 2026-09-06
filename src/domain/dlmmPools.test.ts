import { describe, expect, it } from "vitest";
import { decodeBase58, encodeBase58 } from "./base58";
import { loadDlmmPoolSession } from "./dlmmPools";
import { DLMM_PROGRAM_ID, POSITION_V2_DISCRIMINATOR } from "./meteoraAccounts";
import type {
  GeckoCandle,
  GeckoPoolCandidate,
  GeckoTerminalProvider,
  GeckoTokenMetadata,
  QuotePrice,
} from "../providers/geckoTerminal";
import type {
  MeteoraMetadataProvider,
  MeteoraPoolMetadata,
  MeteoraPoolOrientation,
  MeteoraPoolPage,
} from "../providers/meteoraMetadata";
import { MeteoraMetadataError } from "../providers/meteoraMetadata";
import type {
  AccountScanConfig,
  ReadOnlySolanaRpc,
} from "../providers/solanaRpc";
import oracle from "../test/fixtures/lbPairOracle.json";

const JUP = oracle.expected.tokenXMint;
const SOL = oracle.expected.tokenYMint;
const POOLS = [address(21), address(22), address(23)];

describe("DLMM initial pool selection", () => {
  it("ranks deterministically and enables the first of at most three qualified pools", async () => {
    const rpc = new PoolFixtureRpc(
      JUP,
      POOLS,
      new Map([
        [POOLS[0]!, 1],
        [POOLS[1]!, 0],
        [POOLS[2]!, 4],
      ]),
    );
    const metadata = new PageFixtureProvider({
      x: [
        page("x", [
          metadataRow(POOLS[0]!, 100, 5),
          metadataRow(POOLS[1]!, 100, 20),
          metadataRow(POOLS[2]!, 90, 100),
        ]),
      ],
      y: [page("y", [])],
    });
    const gecko = new QuoteFixtureProvider(true);

    const session = await loadDlmmPoolSession(
      rpc,
      metadata,
      gecko,
      JUP,
      new AbortController().signal,
    );

    expect(session.metadataState).toBe("complete");
    expect(session.maximumSlot).toBe(12);
    expect(session.pools.map((pool) => [pool.address, pool.rank])).toEqual([
      [POOLS[1], 1],
      [POOLS[0], 2],
      [POOLS[2], 3],
    ]);
    expect(session.enabledAddresses).toEqual([POOLS[0]]);
    expect(session.automaticSelectionAddress).toBe(POOLS[0]);
    expect(session.pools[0]).toMatchObject({
      qualification: "no-positions",
      positionCount: 0,
    });
    expect(session.pools[1]).toMatchObject({
      qualification: "qualified",
      positionCount: 1,
      quotePrice: { mint: SOL, priceUsd: 150 },
    });
    expect(rpc.positionProbes).toEqual([POOLS[1], POOLS[0]]);
    expect(gecko.quoteCalls).toEqual([[SOL]]);
  });

  it("completes a boundary tie before applying the volume tie-breaker", async () => {
    const tieWinner = address(24);
    const pools = [...POOLS, tieWinner];
    const rpc = new PoolFixtureRpc(
      JUP,
      pools,
      new Map(pools.map((pool) => [pool, 1])),
    );
    const metadata = new PageFixtureProvider({
      x: [
        page(
          "x",
          [
            metadataRow(POOLS[0]!, 120, 1),
            metadataRow(POOLS[1]!, 110, 1),
            metadataRow(POOLS[2]!, 100, 1),
          ],
          false,
          100,
          1,
          3,
          4,
          2,
        ),
        page("x", [metadataRow(tieWinner, 100, 999)], true, 100, 2, 3, 4, 2),
      ],
      y: [page("y", [])],
    });

    const session = await loadDlmmPoolSession(
      rpc,
      metadata,
      new QuoteFixtureProvider(true),
      JUP,
      new AbortController().signal,
    );

    expect(metadata.calls).toEqual(["x:1", "y:1", "x:2"]);
    expect(session.pools.map((pool) => pool.address).slice(0, 4)).toEqual([
      POOLS[0],
      POOLS[1],
      tieWinner,
      POOLS[2],
    ]);
    expect(session.metadataState).toBe("complete");
  });

  it("requires manual selection when the ranking frontier stays uncleared", async () => {
    const repeated = [
      metadataRow(POOLS[0]!, 100, 1),
      metadataRow(POOLS[1]!, 100, 1),
      metadataRow(POOLS[2]!, 100, 1),
    ];
    const metadata = new PageFixtureProvider({
      x: Array.from({ length: 5 }, (_, index) =>
        page("x", repeated, false, 100, index + 1, 3, 18, 6),
      ),
      y: [page("y", [])],
    });
    const rpc = new PoolFixtureRpc(
      JUP,
      POOLS,
      new Map(POOLS.map((pool) => [pool, 1])),
    );

    const session = await loadDlmmPoolSession(
      rpc,
      metadata,
      new QuoteFixtureProvider(true),
      JUP,
      new AbortController().signal,
    );

    expect(session).toMatchObject({
      metadataState: "incomplete",
      selectionState: "manual-required",
      enabledAddresses: [],
    });
    expect(session.metadataDetail).toMatch(/frontier/i);
    expect(rpc.positionProbes).toEqual([]);
  });

  it("keeps a newer memecoin pool visible when USD conversion is unsupported", async () => {
    const meme = address(44);
    const poolAddress = address(45);
    const rpc = new PoolFixtureRpc(
      meme,
      [poolAddress],
      new Map([[poolAddress, 8]]),
    );
    const metadata = new PageFixtureProvider({
      x: [page("x", [metadataRow(poolAddress, 25_000, 40_000, meme)])],
      y: [page("y", [])],
    });

    const session = await loadDlmmPoolSession(
      rpc,
      metadata,
      new QuoteFixtureProvider(false),
      meme,
      new AbortController().signal,
    );

    expect(session.enabledAddresses).toEqual([]);
    expect(session.selectionState).toBe("manual-required");
    expect(session.pools[0]).toMatchObject({
      address: poolAddress,
      qualification: "no-conversion",
      positionCount: 8,
    });
  });

  it("labels malformed ranking metadata incomplete after one bounded retry", async () => {
    const rpc = new PoolFixtureRpc(JUP, [POOLS[0]!], new Map());
    const malformed: MeteoraMetadataProvider = {
      getPoolPage: () =>
        Promise.reject(
          new MeteoraMetadataError("shape", "fixture page is truncated"),
        ),
    };

    const session = await loadDlmmPoolSession(
      rpc,
      malformed,
      new QuoteFixtureProvider(true),
      JUP,
      new AbortController().signal,
    );

    expect(session).toMatchObject({
      metadataState: "incomplete",
      metadataRequests: 2,
      enabledAddresses: [],
      selectionState: "manual-required",
    });
    expect(session.metadataDetail).toMatch(/truncated/i);
  });

  it("requires manual selection when a position probe violates its minimum slot", async () => {
    const rpc = new PoolFixtureRpc(
      JUP,
      [POOLS[0]!],
      new Map([[POOLS[0]!, 1]]),
      10,
    );
    const metadata = new PageFixtureProvider({
      x: [page("x", [metadataRow(POOLS[0]!, 100, 1)])],
      y: [page("y", [])],
    });

    const session = await loadDlmmPoolSession(
      rpc,
      metadata,
      new QuoteFixtureProvider(true),
      JUP,
      new AbortController().signal,
    );

    expect(session).toMatchObject({
      enabledAddresses: [],
      selectionState: "manual-required",
      maximumSlot: 11,
    });
    expect(session.selectionDetail).toMatch(/minimum context slot/i);
  });

  it("requires manual selection when TVL increases across pages", async () => {
    const pools = [...POOLS, address(24)];
    const metadata = new PageFixtureProvider({
      x: [
        page(
          "x",
          [
            metadataRow(POOLS[0]!, 120, 1),
            metadataRow(POOLS[1]!, 110, 1),
            metadataRow(POOLS[2]!, 100, 1),
          ],
          false,
          100,
          1,
          3,
          4,
          2,
        ),
        page("x", [metadataRow(pools[3]!, 105, 1)], true, 105, 2, 3, 4, 2),
      ],
      y: [page("y", [])],
    });
    const session = await loadDlmmPoolSession(
      new PoolFixtureRpc(JUP, pools, new Map()),
      metadata,
      new QuoteFixtureProvider(true),
      JUP,
      new AbortController().signal,
    );

    expect(session).toMatchObject({
      metadataState: "incomplete",
      enabledAddresses: [],
      selectionState: "manual-required",
    });
    expect(session.metadataDetail).toMatch(/increased across a page boundary/i);
  });
});

class PoolFixtureRpc implements ReadOnlySolanaRpc {
  readonly positionProbes: string[] = [];

  constructor(
    private readonly mint: string,
    private readonly pools: string[],
    private readonly positions: Map<string, number>,
    private readonly positionSlot = 12,
  ) {}

  getTokenSupply<T>(): Promise<T> {
    throw new Error("not used");
  }

  getProgramAccounts<T>(
    _programAddress: string,
    config: AccountScanConfig,
  ): Promise<T> {
    const filters = config.filters as Array<{
      memcmp: { offset: number; bytes: string };
    }>;
    if (filters[0]?.memcmp.bytes === POSITION_V2_DISCRIMINATOR) {
      const pool = filters[1]?.memcmp.bytes ?? "";
      this.positionProbes.push(pool);
      return Promise.resolve({
        context: { slot: this.positionSlot },
        value: Array.from(
          { length: this.positions.get(pool) ?? 0 },
          (_, index) => ({
            pubkey: address(index + 100),
            account: fixtureAccount(""),
          }),
        ),
      } as T);
    }
    return Promise.resolve({
      context: { slot: 10 },
      value:
        filters[1]?.memcmp.offset === 88
          ? this.pools.map((pubkey) => ({
              pubkey,
              account: fixtureAccount(""),
            }))
          : [],
    } as T);
  }

  getMultipleAccounts<T>(addresses: readonly string[]): Promise<T> {
    return Promise.resolve({
      context: { slot: 11 },
      value: addresses.map(() => fixtureAccount(poolAccount(this.mint))),
    } as T);
  }

  getProgramAccountsV2<T>(): Promise<T> {
    throw new Error("not used");
  }
}

class PageFixtureProvider implements MeteoraMetadataProvider {
  readonly calls: string[] = [];

  constructor(
    private readonly pages: Record<MeteoraPoolOrientation, MeteoraPoolPage[]>,
  ) {}

  getPoolPage(
    _mint: string,
    orientation: MeteoraPoolOrientation,
    pageNumber: number,
  ): Promise<MeteoraPoolPage> {
    this.calls.push(`${orientation}:${pageNumber}`);
    const result = this.pages[orientation][pageNumber - 1];
    if (!result) throw new Error("fixture page missing");
    return Promise.resolve(result);
  }
}

class QuoteFixtureProvider implements GeckoTerminalProvider {
  readonly quoteCalls: string[][] = [];

  constructor(private readonly supported: boolean) {}

  getToken(): Promise<GeckoTokenMetadata> {
    throw new Error("not used");
  }

  getPools(): Promise<GeckoPoolCandidate[]> {
    throw new Error("not used");
  }

  getCandles(): Promise<GeckoCandle[]> {
    throw new Error("not used");
  }

  getQuotePrices(mints: readonly string[]): Promise<Map<string, QuotePrice>> {
    this.quoteCalls.push([...mints]);
    return Promise.resolve(
      this.supported
        ? new Map<string, QuotePrice>([
            [SOL, { mint: SOL, priceUsd: 150, observedAt: 1 }],
          ])
        : new Map<string, QuotePrice>(),
    );
  }
}

function page(
  orientation: MeteoraPoolOrientation,
  pools: MeteoraPoolMetadata[],
  exhausted = true,
  frontierTvlUsd = pools.at(-1)?.tvlUsd,
  currentPage = 1,
  pageSize = 20,
  total = pools.length,
  pageCount = exhausted ? currentPage : currentPage + 1,
): MeteoraPoolPage {
  return {
    orientation,
    currentPage,
    pageCount,
    pageSize,
    total,
    pools,
    exhausted,
    frontierTvlUsd,
  };
}

function metadataRow(
  poolAddress: string,
  tvlUsd: number,
  volume24hUsd: number,
  tokenXMint = JUP,
): MeteoraPoolMetadata {
  return {
    address: poolAddress,
    name: "TOKEN-SOL",
    tokenXMint,
    tokenYMint: SOL,
    tvlUsd,
    volume24hUsd,
    blacklisted: false,
    observedAt: 1,
  };
}

function poolAccount(tokenXMint: string): string {
  const bytes = Uint8Array.from(atob(oracle.data), (value) =>
    value.charCodeAt(0),
  );
  bytes.set(decodeBase58(tokenXMint), 88);
  return btoa(String.fromCharCode(...bytes));
}

function fixtureAccount(data: string) {
  return {
    data: [data, "base64"] as [string, "base64"],
    executable: false,
    lamports: 1,
    owner: DLMM_PROGRAM_ID,
  };
}

function address(seed: number): string {
  return encodeBase58(new Uint8Array(32).fill(seed));
}
