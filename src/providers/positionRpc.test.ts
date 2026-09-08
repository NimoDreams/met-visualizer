import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeBase58 } from "../domain/base58";
import {
  BIN_ARRAY_DISCRIMINATOR,
  DLMM_PROGRAM_ID,
  POSITION_V2_DISCRIMINATOR,
} from "../domain/meteoraAccounts";
import oracle from "../test/fixtures/positionOracle.json";
import {
  NativeReadOnlySolanaRpc,
  SolanaRpcError,
  type AccountScanConfig,
  type ReadOnlySolanaRpc,
} from "./solanaRpc";
import { loadPositionRpcSnapshot } from "./positionRpc";
import {
  MAX_BIN_ARRAYS_PER_POOL,
  MAX_POSITIONS_PER_POOL,
} from "./rpcAccountEnvelope";

afterEach(() => vi.restoreAllMocks());

describe("PositionV2 RPC snapshot", () => {
  it("rejects a malformed JSON-RPC envelope before the position read path can inspect it", async () => {
    const endpointMarker = "endpoint-canary";
    const responseMarker = "response-canary";
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ responseMarker })),
    );
    const rpc = new NativeReadOnlySolanaRpc(
      `https://rpc.example.invalid/path?key=${endpointMarker}`,
    );
    const atobSpy = vi.spyOn(globalThis, "atob");
    const request = loadPositionRpcSnapshot(
      rpc,
      oracle.pool,
      oracle.owner,
      1,
      new AbortController().signal,
    );

    await expect(request).rejects.toMatchObject({
      kind: "malformed",
      message: "Solana RPC response is malformed.",
    } satisfies Partial<SolanaRpcError>);
    await expect(request).rejects.not.toThrow(endpointMarker);
    await expect(request).rejects.not.toThrow(responseMarker);
    expect(atobSpy).not.toHaveBeenCalled();
  });

  it("hydrates positions in bounded batches and includes every context slot", async () => {
    const rpc = new PositionFixtureRpc(205);
    const progress: number[] = [];
    const result = await loadPositionRpcSnapshot(
      rpc,
      oracle.pool,
      oracle.owner,
      9,
      new AbortController().signal,
      ({ hydrated }) => progress.push(hydrated),
    );

    expect(result).toMatchObject({
      discoveredCount: 205,
      completePositionSet: true,
      quoteDecimals: 6,
      minimumSlot: 10,
      maximumSlot: 14,
      requests: 6,
    });
    expect(result.positionAccounts).toHaveLength(205);
    expect(result.binArrayData).toHaveLength(2);
    expect(rpc.batchSizes).toEqual([100, 100, 5]);
    expect(rpc.supplyConfigs).toEqual([
      { commitment: "confirmed", minContextSlot: 13 },
    ]);
    expect(progress).toEqual([0, 100, 200, 205]);
    expect(rpc.programCalls).toEqual([
      expect.objectContaining({
        minContextSlot: 9,
        dataSlice: { offset: 0, length: 0 },
        filters: [
          { memcmp: { offset: 0, bytes: POSITION_V2_DISCRIMINATOR } },
          { memcmp: { offset: 8, bytes: oracle.pool } },
        ],
      }),
      expect.objectContaining({
        minContextSlot: 13,
        filters: [
          { memcmp: { offset: 0, bytes: BIN_ARRAY_DISCRIMINATOR } },
          { memcmp: { offset: 24, bytes: oracle.pool } },
        ],
      }),
    ]);
  });

  it("marks the denominator incomplete when a discovered account disappears", async () => {
    const rpc = new PositionFixtureRpc(2);
    rpc.missingLast = true;
    const result = await loadPositionRpcSnapshot(
      rpc,
      oracle.pool,
      oracle.owner,
      1,
      new AbortController().signal,
    );
    expect(result.discoveredCount).toBe(2);
    expect(result.positionAccounts).toHaveLength(1);
    expect(result.completePositionSet).toBe(false);
  });

  it("rejects a stale token or bin response instead of mixing snapshots", async () => {
    const rpc = new PositionFixtureRpc(1);
    rpc.supplySlot = 10;
    await expect(
      loadPositionRpcSnapshot(
        rpc,
        oracle.pool,
        oracle.owner,
        9,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/stale or malformed/i);
  });

  it("accepts SPL decimal metadata through 255 and rejects N+1", async () => {
    const accepted = new PositionFixtureRpc(1);
    accepted.supplyDecimals = 255;
    await expect(
      loadPositionRpcSnapshot(
        accepted,
        oracle.pool,
        oracle.owner,
        1,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ quoteDecimals: 255 });

    const rejected = new PositionFixtureRpc(1);
    rejected.supplyDecimals = 256;
    await expect(
      loadPositionRpcSnapshot(
        rejected,
        oracle.pool,
        oracle.owner,
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/stale or malformed/i);
  });

  it("keeps the 1,800-position JUP shape to 18 bounded hydration calls", async () => {
    const rpc = new PositionFixtureRpc(1_800);
    const startedAt = performance.now();
    const result = await loadPositionRpcSnapshot(
      rpc,
      oracle.pool,
      oracle.owner,
      1,
      new AbortController().signal,
    );
    expect(result.positionAccounts).toHaveLength(1_800);
    expect(rpc.batchSizes).toHaveLength(18);
    expect(rpc.batchSizes.every((size) => size === 100)).toBe(true);
    expect(result.requests).toBe(21);
    expect(result.bytes).toBe(15_039_472);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  });

  it("rejects 5,001 positions before hydration while preserving the 5,000 boundary", async () => {
    const accepted = new PositionFixtureRpc(MAX_POSITIONS_PER_POOL);
    const acceptedResult = await loadPositionRpcSnapshot(
      accepted,
      oracle.pool,
      oracle.owner,
      1,
      new AbortController().signal,
    );
    expect(acceptedResult.discoveredCount).toBe(MAX_POSITIONS_PER_POOL);
    expect(accepted.batchSizes).toHaveLength(50);

    const rejected = new PositionFixtureRpc(MAX_POSITIONS_PER_POOL + 1);
    const atobSpy = vi.spyOn(globalThis, "atob");
    await expect(
      loadPositionRpcSnapshot(
        rejected,
        oracle.pool,
        oracle.owner,
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/supported account limit/i);
    expect(rejected.batchSizes).toEqual([]);
    expect(rejected.programCalls).toHaveLength(1);
    expect(atobSpy).not.toHaveBeenCalled();
  });

  it("accepts 512 BinArrays and rejects 513 before downstream decoding", async () => {
    const accepted = new PositionFixtureRpc(0);
    accepted.binCount = MAX_BIN_ARRAYS_PER_POOL;
    const acceptedResult = await loadPositionRpcSnapshot(
      accepted,
      oracle.pool,
      oracle.owner,
      1,
      new AbortController().signal,
    );
    expect(acceptedResult.binArrayData).toHaveLength(MAX_BIN_ARRAYS_PER_POOL);

    const rejected = new PositionFixtureRpc(0);
    rejected.binCount = MAX_BIN_ARRAYS_PER_POOL + 1;
    const atobSpy = vi.spyOn(globalThis, "atob");
    await expect(
      loadPositionRpcSnapshot(
        rejected,
        oracle.pool,
        oracle.owner,
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/supported account limit/i);
    expect(atobSpy).not.toHaveBeenCalled();
  });

  it("deduplicates canonical position keys before hydration", async () => {
    const rpc = new PositionFixtureRpc(0);
    rpc.discoveryAddresses = [
      numberedAddress(1),
      numberedAddress(1),
      numberedAddress(2),
    ];
    const result = await loadPositionRpcSnapshot(
      rpc,
      oracle.pool,
      oracle.owner,
      1,
      new AbortController().signal,
    );
    expect(result.discoveredCount).toBe(2);
    expect(result.positionAccounts).toHaveLength(2);
    expect(rpc.batchSizes).toEqual([2]);
  });

  it("rejects noncanonical discovery keys before hydration", async () => {
    const rpc = new PositionFixtureRpc(0);
    rpc.discoveryAddresses = ["not-a-solana-address"];
    await expect(
      loadPositionRpcSnapshot(
        rpc,
        oracle.pool,
        oracle.owner,
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/canonical 32-byte/i);
    expect(rpc.batchSizes).toEqual([]);
    expect(rpc.programCalls).toHaveLength(1);
  });

  it("requires exact PositionV2 tuples, owner, executable state, and base64 size", async () => {
    const malformedTuple = {
      ...account(oracle.positionData),
      data: [oracle.positionData, "base64", "extra"],
    };
    const invalidAccounts: unknown[] = [
      malformedTuple,
      { ...account(oracle.positionData), owner: oracle.owner },
      { ...account(oracle.positionData), executable: true },
      account(Buffer.alloc(157_081).toString("base64")),
    ];

    for (const invalidAccount of invalidAccounts) {
      const rpc = new PositionFixtureRpc(1);
      rpc.positionAccountOverride = invalidAccount;
      const atobSpy = vi.spyOn(globalThis, "atob");
      await expect(
        loadPositionRpcSnapshot(
          rpc,
          oracle.pool,
          oracle.owner,
          1,
          new AbortController().signal,
        ),
      ).rejects.toThrow(/encoding|owner|executable|size limit/i);
      expect(rpc.programCalls).toHaveLength(1);
      expect(atobSpy).not.toHaveBeenCalled();
      atobSpy.mockRestore();
    }
  });

  it("rejects unsafe requested and response slots", async () => {
    const invalidRequest = new PositionFixtureRpc(1);
    await expect(
      loadPositionRpcSnapshot(
        invalidRequest,
        oracle.pool,
        oracle.owner,
        -1,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/slot is malformed/i);
    expect(invalidRequest.programCalls).toEqual([]);

    const invalidResponse = new PositionFixtureRpc(1);
    invalidResponse.discoverySlot = Number.MAX_SAFE_INTEGER + 1;
    await expect(
      loadPositionRpcSnapshot(
        invalidResponse,
        oracle.pool,
        oracle.owner,
        1,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/response is malformed/i);
    expect(invalidResponse.batchSizes).toEqual([]);
  });
});

type RpcAccount = {
  data: [string, "base64"];
  executable: boolean;
  lamports: number;
  owner: string;
};

class PositionFixtureRpc implements ReadOnlySolanaRpc {
  readonly batchSizes: number[] = [];
  readonly programCalls: AccountScanConfig[] = [];
  readonly supplyConfigs: AccountScanConfig[] = [];
  missingLast = false;
  supplySlot?: number;
  supplyDecimals = 6;
  discoverySlot = 10;
  binCount = oracle.binArrayData.length;
  discoveryAddresses?: string[];
  positionAccountOverride?: unknown;

  constructor(private readonly count: number) {}

  getTokenSupply<T>(
    _mint: string,
    _signal?: AbortSignal,
    config?: AccountScanConfig,
  ): Promise<T> {
    if (config) this.supplyConfigs.push(config);
    return Promise.resolve({
      context: { slot: this.supplySlot ?? this.snapshotSlot },
      value: { amount: "1", decimals: this.supplyDecimals },
    } as T);
  }

  getProgramAccounts<T>(
    _program: string,
    config: AccountScanConfig,
  ): Promise<T> {
    this.programCalls.push(config);
    const discriminator = (
      config.filters as Array<{ memcmp: { bytes: string } }>
    )[0]?.memcmp.bytes;
    if (discriminator === POSITION_V2_DISCRIMINATOR) {
      return Promise.resolve({
        context: { slot: this.discoverySlot },
        value: (
          this.discoveryAddresses ??
          Array.from({ length: this.count }, (_, index) =>
            numberedAddress(index),
          )
        ).map((pubkey) => ({
          pubkey,
          account: account(""),
        })),
      } as T);
    }
    return Promise.resolve({
      context: { slot: this.snapshotSlot },
      value: Array.from({ length: this.binCount }, (_, index) => ({
        pubkey: numberedAddress(10_000 + index),
        account: account(
          oracle.binArrayData[index % oracle.binArrayData.length]!,
        ),
      })),
    } as T);
  }

  getMultipleAccounts<T>(addresses: readonly string[]): Promise<T> {
    this.batchSizes.push(addresses.length);
    const batchNumber = this.batchSizes.length;
    return Promise.resolve({
      context: { slot: 10 + batchNumber },
      value: addresses.map((_, index) =>
        this.missingLast &&
        batchNumber === Math.ceil(this.count / 100) &&
        index === addresses.length - 1
          ? null
          : (this.positionAccountOverride ?? account(oracle.positionData)),
      ),
    } as T);
  }

  getProgramAccountsV2<T>(): Promise<T> {
    throw new Error("not used");
  }

  private get snapshotSlot(): number {
    return 11 + Math.ceil(this.count / 100);
  }
}

function account(data: string): RpcAccount {
  return {
    data: [data, "base64"],
    executable: false,
    lamports: 1,
    owner: DLMM_PROGRAM_ID,
  };
}

function numberedAddress(index: number): string {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setUint32(28, index + 1, false);
  return encodeBase58(bytes);
}
