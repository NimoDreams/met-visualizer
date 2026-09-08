import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeBase58, encodeBase58 } from "../domain/base58";
import {
  DLMM_PROGRAM_ID,
  LB_PAIR_DISCRIMINATOR,
  POSITION_V2_DISCRIMINATOR,
} from "../domain/meteoraAccounts";
import oracle from "../test/fixtures/lbPairOracle.json";
import {
  NativeReadOnlySolanaRpc,
  SolanaRpcError,
  type AccountScanConfig,
  type MultipleAccountsConfig,
  type ReadOnlySolanaRpc,
} from "./solanaRpc";
import { countPoolPositions, discoverDlmmPools } from "./meteoraRpc";
import {
  MAX_DLMM_POOLS_PER_TOKEN,
  MAX_POSITIONS_PER_POOL,
} from "./rpcAccountEnvelope";

const JUP = oracle.expected.tokenXMint;
const SOL = oracle.expected.tokenYMint;
const SECOND_POOL = encodeBase58(new Uint8Array(32).fill(7));

afterEach(() => vi.restoreAllMocks());

describe("Meteora RPC discovery", () => {
  it("rejects a malformed JSON-RPC envelope before the DLMM pool read path can inspect it", async () => {
    const endpointMarker = "endpoint-canary";
    const responseMarker = "response-canary";
    vi.spyOn(window, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(responseMarker))),
    );
    const rpc = new NativeReadOnlySolanaRpc(
      `https://rpc.example.invalid/path?key=${endpointMarker}`,
    );
    const request = discoverDlmmPools(rpc, JUP, new AbortController().signal);

    await expect(request).rejects.toMatchObject({
      kind: "malformed",
      message: "Solana RPC response is malformed.",
    } satisfies Partial<SolanaRpcError>);
    await expect(request).rejects.not.toThrow(endpointMarker);
    await expect(request).rejects.not.toThrow(responseMarker);
  });

  it("scans both mint orientations and hydrates decoded pools at a shared context", async () => {
    const rpc = new FixtureRpc([
      account(oracle.data),
      account(reorientedAccount()),
    ]);

    const result = await discoverDlmmPools(
      rpc,
      JUP,
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      minimumSlot: 100,
      maximumSlot: 120,
      missingAccounts: 0,
    });
    expect(result.pools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: oracle.address,
          discoveredAs: ["x"],
          decodeState: "ready",
          tokenXMint: JUP,
          tokenYMint: SOL,
        }),
        expect.objectContaining({
          address: SECOND_POOL,
          discoveredAs: ["y"],
          decodeState: "ready",
          tokenXMint: SOL,
          tokenYMint: JUP,
        }),
      ]),
    );
    expect(rpc.programCalls[0]?.programAddress).toBe(DLMM_PROGRAM_ID);
    expect(rpc.programCalls[0]?.config).toMatchObject({
      withContext: true,
      dataSlice: { offset: 0, length: 0 },
      filters: [
        { memcmp: { offset: 0, bytes: LB_PAIR_DISCRIMINATOR } },
        { memcmp: { offset: 88, bytes: JUP } },
      ],
    });
    expect(rpc.programCalls[1]?.config).toMatchObject({
      filters: [
        { memcmp: { offset: 0, bytes: LB_PAIR_DISCRIMINATOR } },
        { memcmp: { offset: 120, bytes: JUP } },
      ],
    });
    expect(rpc.multipleCalls[0]?.config).toMatchObject({
      minContextSlot: 110,
      encoding: "base64",
    });
  });

  it("keeps a disappeared pool visible as unavailable", async () => {
    const rpc = new FixtureRpc([null, account(reorientedAccount())]);
    const result = await discoverDlmmPools(
      rpc,
      JUP,
      new AbortController().signal,
    );

    expect(result.missingAccounts).toBe(1);
    expect(result.pools).toContainEqual({
      address: oracle.address,
      discoveredAs: ["x"],
      decodeState: "unavailable",
      reason: "Account disappeared before hydration.",
    });
  });

  it("counts only PositionV2 accounts for the selected pool", async () => {
    const rpc = new FixtureRpc([]);
    rpc.positionCount = 37;

    await expect(
      countPoolPositions(
        rpc,
        oracle.address,
        400,
        new AbortController().signal,
      ),
    ).resolves.toEqual({ count: 37, slot: 450 });
    expect(rpc.programCalls.at(-1)?.config).toMatchObject({
      minContextSlot: 400,
      dataSlice: { offset: 0, length: 0 },
      filters: [
        { memcmp: { offset: 0, bytes: POSITION_V2_DISCRIMINATOR } },
        { memcmp: { offset: 8, bytes: oracle.address } },
      ],
    });
  });

  it("rejects a position probe below the requested context slot", async () => {
    const rpc = new FixtureRpc([]);
    rpc.positionSlot = 399;

    await expect(
      countPoolPositions(
        rpc,
        oracle.address,
        400,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/minimum context slot/i);
  });

  it("rejects stale hydration, then recovers on a fresh retry", async () => {
    const rpc = new FixtureRpc([
      account(oracle.data),
      account(reorientedAccount()),
    ]);
    rpc.hydrationSlot = 109;
    await expect(
      discoverDlmmPools(rpc, JUP, new AbortController().signal),
    ).rejects.toThrow(/minimum context slot/i);
    expect(rpc.multipleCalls[0]?.config).toMatchObject({ minContextSlot: 110 });

    rpc.hydrationSlot = 120;
    await expect(
      discoverDlmmPools(rpc, JUP, new AbortController().signal),
    ).resolves.toMatchObject({ maximumSlot: 120 });
  });

  it("advances the requested minimum slot across hydration batches", async () => {
    const stale = new StressRpc(101, [2, 1]);
    await expect(
      discoverDlmmPools(stale, JUP, new AbortController().signal),
    ).rejects.toThrow(/minimum context slot/i);
    expect(stale.requestedMinSlots).toEqual([1, 2]);

    const current = new StressRpc(101, [2, 2]);
    const result = await discoverDlmmPools(
      current,
      JUP,
      new AbortController().signal,
    );
    expect(result.pools).toHaveLength(101);
    expect(result.maximumSlot).toBe(2);
  });

  it("rejects unsafe slots and invalid discovery addresses before decoding", async () => {
    const unsafeSlot = new FixtureRpc([
      account(oracle.data),
      account(reorientedAccount()),
    ]);
    unsafeSlot.scanSlotX = -1;
    await expect(
      discoverDlmmPools(unsafeSlot, JUP, new AbortController().signal),
    ).rejects.toThrow(/missing context or values/i);

    const invalidAddress = new FixtureRpc([
      account(oracle.data),
      account(reorientedAccount()),
    ]);
    invalidAddress.scanAddressX = "invalid-pool-address";
    await expect(
      discoverDlmmPools(invalidAddress, JUP, new AbortController().signal),
    ).rejects.toThrow(/canonical 32-byte/i);
  });

  it("honors cancellation even when a fixture RPC returns after abort", async () => {
    const controller = new AbortController();
    const rpc = new FixtureRpc([
      account(oracle.data),
      account(reorientedAccount()),
    ]);
    rpc.onHydration = () => controller.abort();
    await expect(
      discoverDlmmPools(rpc, JUP, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "RPC request was cancelled.",
    });
  });

  it("hydrates the 626-pool JUP stress shape in bounded account batches", async () => {
    const rpc = new StressRpc(626);
    const result = await discoverDlmmPools(
      rpc,
      JUP,
      new AbortController().signal,
    );

    expect(result.pools).toHaveLength(626);
    expect(rpc.batchSizes).toEqual([100, 100, 100, 100, 100, 100, 26]);
    expect(result.pools.every((pool) => pool.decodeState === "ready")).toBe(
      true,
    );
  });

  it("accepts 2,000 discovered pools and rejects 2,001 before hydration", async () => {
    const accepted = new StressRpc(MAX_DLMM_POOLS_PER_TOKEN);
    const acceptedResult = await discoverDlmmPools(
      accepted,
      JUP,
      new AbortController().signal,
    );
    expect(acceptedResult.pools).toHaveLength(MAX_DLMM_POOLS_PER_TOKEN);
    expect(
      acceptedResult.pools.every(({ decodeState }) => decodeState === "ready"),
    ).toBe(true);
    expect(accepted.batchSizes).toHaveLength(20);

    const rejected = new StressRpc(MAX_DLMM_POOLS_PER_TOKEN + 1);
    await expect(
      discoverDlmmPools(rejected, JUP, new AbortController().signal),
    ).rejects.toThrow(/supported account limit/i);
    expect(rejected.batchSizes).toEqual([]);
  });

  it("deduplicates canonical pool addresses before batching", async () => {
    const rpc = new StressRpc(2);
    rpc.addresses.push(rpc.addresses[0]!);
    const result = await discoverDlmmPools(
      rpc,
      JUP,
      new AbortController().signal,
    );
    expect(result.pools).toHaveLength(2);
    expect(rpc.batchSizes).toEqual([2]);
  });

  it("rejects 2,001 unique pools split across both mint orientations", async () => {
    const rpc = new StressRpc(1_000, 1_001);
    await expect(
      discoverDlmmPools(rpc, JUP, new AbortController().signal),
    ).rejects.toThrow(/supported pool limit/i);
    expect(rpc.batchSizes).toEqual([]);
  });

  it("rejects noncanonical discovery addresses and unsafe slots before hydration", async () => {
    const invalidAddress = new StressRpc(1);
    invalidAddress.addresses[0] = "not-a-solana-address";
    await expect(
      discoverDlmmPools(invalidAddress, JUP, new AbortController().signal),
    ).rejects.toThrow(/canonical 32-byte/i);
    expect(invalidAddress.batchSizes).toEqual([]);

    const unsafeSlot = new FixtureRpc([]);
    unsafeSlot.scanSlotX = Number.MAX_SAFE_INTEGER + 1;
    await expect(
      discoverDlmmPools(unsafeSlot, JUP, new AbortController().signal),
    ).rejects.toThrow(/missing context or values/i);
    expect(unsafeSlot.multipleCalls).toEqual([]);
  });

  it("accepts 5,000 position keys and rejects 5,001 with no downstream decode", async () => {
    const rpc = new FixtureRpc([]);
    rpc.positionCount = MAX_POSITIONS_PER_POOL;
    await expect(
      countPoolPositions(
        rpc,
        oracle.address,
        400,
        new AbortController().signal,
      ),
    ).resolves.toEqual({ count: MAX_POSITIONS_PER_POOL, slot: 450 });

    rpc.positionCount = MAX_POSITIONS_PER_POOL + 1;
    const atobSpy = vi.spyOn(globalThis, "atob");
    await expect(
      countPoolPositions(
        rpc,
        oracle.address,
        400,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/supported account limit/i);
    expect(atobSpy).not.toHaveBeenCalled();
    expect(rpc.multipleCalls).toEqual([]);
  });

  it("requires an exact base64 tuple, owner, and nonexecutable account", async () => {
    const malformed = account(oracle.data) as unknown as {
      data: [string, "base64", string];
      executable: boolean;
      lamports: number;
      owner: string;
    };
    malformed.data = [oracle.data, "base64", "extra"];
    const rpc = new FixtureRpc([
      malformed as unknown as FixtureAccount,
      { ...account(reorientedAccount()), executable: true },
    ]);
    const result = await discoverDlmmPools(
      rpc,
      JUP,
      new AbortController().signal,
    );
    const malformedPool = result.pools.find(
      ({ address }) => address === oracle.address,
    );
    const executablePool = result.pools.find(
      ({ address }) => address === SECOND_POOL,
    );
    expect(malformedPool?.decodeState).toBe("unavailable");
    expect(
      malformedPool?.decodeState === "unavailable" ? malformedPool.reason : "",
    ).toMatch(/encoding is malformed/i);
    expect(executablePool?.decodeState).toBe("unavailable");
    expect(
      executablePool?.decodeState === "unavailable"
        ? executablePool.reason
        : "",
    ).toMatch(/owner or executable/i);
  });

  it("rejects oversized LB pair data before atob", async () => {
    const rpc = new FixtureRpc([
      account(Buffer.alloc(4_097).toString("base64")),
      null,
    ]);
    const atobSpy = vi.spyOn(globalThis, "atob");
    const result = await discoverDlmmPools(
      rpc,
      JUP,
      new AbortController().signal,
    );
    const oversizedPool = result.pools.find(
      ({ address }) => address === oracle.address,
    );
    expect(oversizedPool?.decodeState).toBe("unavailable");
    expect(
      oversizedPool?.decodeState === "unavailable" ? oversizedPool.reason : "",
    ).toMatch(/size limit|unsupported decoded size/i);
    expect(atobSpy).not.toHaveBeenCalled();
  });
});

type FixtureAccount = {
  data: [string, "base64"];
  executable: boolean;
  lamports: number;
  owner: string;
};

class FixtureRpc implements ReadOnlySolanaRpc {
  readonly programCalls: Array<{
    programAddress: string;
    config: AccountScanConfig;
  }> = [];
  readonly multipleCalls: Array<{
    addresses: readonly string[];
    config: MultipleAccountsConfig;
  }> = [];
  positionCount = 0;
  positionSlot = 450;
  scanSlotX = 100;
  scanSlotY = 110;
  hydrationSlot = 120;
  onHydration?: () => void;
  scanAddressX = oracle.address;

  constructor(private readonly hydrated: Array<FixtureAccount | null>) {}

  getTokenSupply<T>(): Promise<T> {
    throw new Error("not used");
  }

  getProgramAccounts<T>(
    programAddress: string,
    config: AccountScanConfig,
  ): Promise<T> {
    this.programCalls.push({ programAddress, config });
    const firstFilter = (
      config.filters as Array<{ memcmp: { bytes: string } }>
    )[0];
    if (firstFilter?.memcmp.bytes === POSITION_V2_DISCRIMINATOR) {
      return Promise.resolve({
        context: { slot: this.positionSlot },
        value: Array.from({ length: this.positionCount }, (_, index) => ({
          pubkey: numberedAddress(index + 10),
          account: account(""),
        })),
      } as T);
    }
    const mintFilter = (
      config.filters as Array<{ memcmp: { offset: number; bytes: string } }>
    )[1];
    const isX = mintFilter?.memcmp.offset === 88;
    return Promise.resolve({
      context: { slot: isX ? this.scanSlotX : this.scanSlotY },
      value: [
        {
          pubkey: isX ? this.scanAddressX : SECOND_POOL,
          account: account(""),
        },
      ],
    } as T);
  }

  getMultipleAccounts<T>(
    addresses: readonly string[],
    config: MultipleAccountsConfig,
  ): Promise<T> {
    this.multipleCalls.push({ addresses, config });
    this.onHydration?.();
    return Promise.resolve({
      context: { slot: this.hydrationSlot },
      value: this.hydrated,
    } as T);
  }

  getProgramAccountsV2<T>(): Promise<T> {
    throw new Error("not used");
  }
}

class StressRpc implements ReadOnlySolanaRpc {
  readonly batchSizes: number[] = [];
  readonly requestedMinSlots: number[] = [];
  readonly addresses: string[];
  readonly yAddresses: string[];
  readonly hydrationSlots: number[];

  constructor(count: number, yCountOrHydrationSlots: number | number[] = 0) {
    this.addresses = Array.from({ length: count }, (_, index) =>
      numberedAddress(index + 1),
    );
    const yCount =
      typeof yCountOrHydrationSlots === "number" ? yCountOrHydrationSlots : 0;
    this.yAddresses = Array.from({ length: yCount }, (_, index) =>
      numberedAddress(count + index + 1),
    );
    this.hydrationSlots = Array.isArray(yCountOrHydrationSlots)
      ? yCountOrHydrationSlots
      : [];
  }

  getTokenSupply<T>(): Promise<T> {
    throw new Error("not used");
  }

  getProgramAccounts<T>(
    _program: string,
    config: AccountScanConfig,
  ): Promise<T> {
    const filters = config.filters as Array<{
      memcmp: { offset: number; bytes: string };
    }>;
    return Promise.resolve({
      context: { slot: 1 },
      value:
        filters[1]?.memcmp.offset === 88
          ? this.addresses.map((pubkey) => ({ pubkey, account: account("") }))
          : this.yAddresses.map((pubkey) => ({
              pubkey,
              account: account(""),
            })),
    } as T);
  }

  getMultipleAccounts<T>(
    addresses: readonly string[],
    config: MultipleAccountsConfig,
  ): Promise<T> {
    this.batchSizes.push(addresses.length);
    this.requestedMinSlots.push(Number(config.minContextSlot));
    const slot = this.hydrationSlots[this.batchSizes.length - 1] ?? 2;
    return Promise.resolve({
      context: { slot },
      value: addresses.map(() => account(oracle.data)),
    } as T);
  }

  getProgramAccountsV2<T>(): Promise<T> {
    throw new Error("not used");
  }
}

function account(data: string): FixtureAccount {
  return {
    data: [data, "base64"],
    executable: false,
    lamports: 1,
    owner: DLMM_PROGRAM_ID,
  };
}

function reorientedAccount(): string {
  const bytes = Uint8Array.from(atob(oracle.data), (value) =>
    value.charCodeAt(0),
  );
  bytes.set(decodeBase58(SOL), 88);
  bytes.set(decodeBase58(JUP), 120);
  return btoa(String.fromCharCode(...bytes));
}

function numberedAddress(value: number): string {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setUint32(28, value);
  return encodeBase58(bytes);
}
