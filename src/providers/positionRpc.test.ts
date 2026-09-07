import { describe, expect, it } from "vitest";
import { encodeBase58 } from "../domain/base58";
import {
  BIN_ARRAY_DISCRIMINATOR,
  DLMM_PROGRAM_ID,
  POSITION_V2_DISCRIMINATOR,
} from "../domain/meteoraAccounts";
import oracle from "../test/fixtures/positionOracle.json";
import type { AccountScanConfig, ReadOnlySolanaRpc } from "./solanaRpc";
import { loadPositionRpcSnapshot } from "./positionRpc";

describe("PositionV2 RPC snapshot", () => {
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

  constructor(private readonly count: number) {}

  getTokenSupply<T>(
    _mint: string,
    _signal?: AbortSignal,
    config?: AccountScanConfig,
  ): Promise<T> {
    if (config) this.supplyConfigs.push(config);
    return Promise.resolve({
      context: { slot: this.supplySlot ?? this.snapshotSlot },
      value: { amount: "1", decimals: 6 },
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
        context: { slot: 10 },
        value: Array.from({ length: this.count }, (_, index) => ({
          pubkey: numberedAddress(index),
          account: account(""),
        })),
      } as T);
    }
    return Promise.resolve({
      context: { slot: this.snapshotSlot },
      value: oracle.binArrayData.map((data, index) => ({
        pubkey: `bin-${index}`,
        account: account(data),
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
          : account(oracle.positionData),
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
