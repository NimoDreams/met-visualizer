import { describe, expect, it } from "vitest";
import { decodeBase58, encodeBase58 } from "../domain/base58";
import {
  DLMM_PROGRAM_ID,
  LB_PAIR_DISCRIMINATOR,
  POSITION_V2_DISCRIMINATOR,
} from "../domain/meteoraAccounts";
import oracle from "../test/fixtures/lbPairOracle.json";
import type {
  AccountScanConfig,
  MultipleAccountsConfig,
  ReadOnlySolanaRpc,
} from "./solanaRpc";
import { countPoolPositions, discoverDlmmPools } from "./meteoraRpc";

const JUP = oracle.expected.tokenXMint;
const SOL = oracle.expected.tokenYMint;
const SECOND_POOL = encodeBase58(new Uint8Array(32).fill(7));

describe("Meteora RPC discovery", () => {
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
        context: { slot: 450 },
        value: Array.from({ length: this.positionCount }, (_, index) => ({
          pubkey: encodeBase58(new Uint8Array(32).fill(index + 10)),
          account: account(""),
        })),
      } as T);
    }
    const mintFilter = (
      config.filters as Array<{ memcmp: { offset: number; bytes: string } }>
    )[1];
    const isX = mintFilter?.memcmp.offset === 88;
    return Promise.resolve({
      context: { slot: isX ? 100 : 110 },
      value: [
        {
          pubkey: isX ? oracle.address : SECOND_POOL,
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
    return Promise.resolve({
      context: { slot: 120 },
      value: this.hydrated,
    } as T);
  }

  getProgramAccountsV2<T>(): Promise<T> {
    throw new Error("not used");
  }
}

class StressRpc implements ReadOnlySolanaRpc {
  readonly batchSizes: number[] = [];
  readonly addresses: string[];

  constructor(count: number) {
    this.addresses = Array.from({ length: count }, (_, index) =>
      numberedAddress(index + 1),
    );
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
          : [],
    } as T);
  }

  getMultipleAccounts<T>(addresses: readonly string[]): Promise<T> {
    this.batchSizes.push(addresses.length);
    return Promise.resolve({
      context: { slot: 2 },
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
