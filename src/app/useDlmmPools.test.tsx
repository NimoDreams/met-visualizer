import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { decodeBase58 } from "../domain/base58";
import {
  DLMM_PROGRAM_ID,
  POSITION_V2_DISCRIMINATOR,
} from "../domain/meteoraAccounts";
import type {
  GeckoCandle,
  GeckoPoolCandidate,
  GeckoTerminalProvider,
  GeckoTokenMetadata,
  QuotePrice,
} from "../providers/geckoTerminal";
import type {
  MeteoraMetadataProvider,
  MeteoraPoolOrientation,
  MeteoraPoolPage,
} from "../providers/meteoraMetadata";
import type {
  AccountScanConfig,
  ReadOnlySolanaRpc,
} from "../providers/solanaRpc";
import oracle from "../test/fixtures/lbPairOracle.json";
import { useDlmmPools } from "./useDlmmPools";

const JUP = oracle.expected.tokenXMint;
const SOL = oracle.expected.tokenYMint;

describe("useDlmmPools", () => {
  it("retries an initial RPC failure for the same token", async () => {
    const rpc = new OnePoolRpc();
    const metadata = new ToggleMetadataProvider();
    const gecko = new OneQuoteProvider();
    rpc.fail = true;
    const { result } = renderHook(() =>
      useDlmmPools(JUP, rpc, metadata, gecko),
    );
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    rpc.fail = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(readySession(result.current.state).mint).toBe(JUP);
  });

  it("shows a stale hydration error and recovers through the existing retry", async () => {
    const rpc = new OnePoolRpc();
    const metadata = new ToggleMetadataProvider();
    const gecko = new OneQuoteProvider();
    rpc.hydrationSlot = 0;
    const { result } = renderHook(() =>
      useDlmmPools(JUP, rpc, metadata, gecko),
    );

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    if (result.current.state.status !== "error")
      throw new Error("expected the stale hydration error state");
    expect(result.current.state.message).toMatch(/minimum context slot/i);
    rpc.hydrationSlot = 2;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });

  it("preserves the enabled pool and last-good metadata on provider refresh failure", async () => {
    const rpc = new OnePoolRpc();
    const metadata = new ToggleMetadataProvider();
    const gecko = new OneQuoteProvider();
    const { result } = renderHook(() =>
      useDlmmPools(JUP, rpc, metadata, gecko),
    );

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(readySession(result.current.state).enabledAddresses).toEqual([
      oracle.address,
    ]);
    expect(readySession(result.current.state).metadataStale).toBe(false);

    metadata.fail = true;
    await act(async () => result.current.refresh());

    const refreshed = readySession(result.current.state);
    expect(refreshed.enabledAddresses).toEqual([oracle.address]);
    expect(refreshed.metadataStale).toBe(true);
    expect(refreshed.pools[0]?.metadata?.tvlUsd).toBe(50_000);
    expect(refreshed.selectionDetail).toMatch(/highest-ranked/i);

    metadata.fail = false;
    gecko.fail = true;
    await act(async () => result.current.refresh());
    const quoteFailure = readySession(result.current.state);
    expect(quoteFailure.enabledAddresses).toEqual([oracle.address]);
    expect(quoteFailure.quoteStale).toBe(true);
    expect(quoteFailure.pools[0]?.quotePrice?.priceUsd).toBe(150);

    act(() => result.current.toggle(oracle.address));
    expect(readySession(result.current.state).quoteStale).toBe(false);
    act(() => result.current.toggle(oracle.address));
    expect(readySession(result.current.state).quoteStale).toBe(true);
  });

  it("keeps last-good pool data visibly stale when RPC refresh fails", async () => {
    const rpc = new OnePoolRpc();
    const metadata = new ToggleMetadataProvider();
    const gecko = new OneQuoteProvider();
    const { result } = renderHook(() =>
      useDlmmPools(JUP, rpc, metadata, gecko),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    rpc.fail = true;
    await act(async () => result.current.refresh());

    expect(result.current.state).toMatchObject({
      status: "ready",
      refreshing: false,
      actionError: "fixture RPC unavailable",
      session: {
        rpcStale: true,
        enabledAddresses: [oracle.address],
      },
    });
  });

  it("preserves a manual toggle made while a successful refresh is pending", async () => {
    const rpc = new OnePoolRpc();
    const metadata = new ToggleMetadataProvider();
    const gecko = new OneQuoteProvider();
    const { result } = renderHook(() =>
      useDlmmPools(JUP, rpc, metadata, gecko),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    metadata.deferNextX = true;
    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "ready",
        refreshing: true,
      }),
    );

    act(() => result.current.toggle(oracle.address));
    expect(readySession(result.current.state).enabledAddresses).toEqual([]);
    expect(result.current.state).toMatchObject({ refreshing: true });

    act(() => metadata.release());
    await act(async () => refreshPromise);
    expect(readySession(result.current.state)).toMatchObject({
      enabledAddresses: [],
      selectionState: "manual",
    });
  });
});

class OnePoolRpc implements ReadOnlySolanaRpc {
  fail = false;
  hydrationSlot = 2;

  getTokenSupply<T>(): Promise<T> {
    throw new Error("not used");
  }

  getProgramAccounts<T>(
    _program: string,
    config: AccountScanConfig,
  ): Promise<T> {
    if (this.fail) return Promise.reject(new Error("fixture RPC unavailable"));
    const filters = config.filters as Array<{
      memcmp: { offset: number; bytes: string };
    }>;
    if (filters[0]?.memcmp.bytes === POSITION_V2_DISCRIMINATOR) {
      return Promise.resolve({
        context: { slot: 3 },
        value: [{ pubkey: SOL, account: account("") }],
      } as T);
    }
    return Promise.resolve({
      context: { slot: 1 },
      value:
        filters[1]?.memcmp.offset === 88
          ? [{ pubkey: oracle.address, account: account("") }]
          : [],
    } as T);
  }

  getMultipleAccounts<T>(): Promise<T> {
    if (this.fail) return Promise.reject(new Error("fixture RPC unavailable"));
    return Promise.resolve({
      context: { slot: this.hydrationSlot },
      value: [account(poolAccount(JUP))],
    } as T);
  }

  getProgramAccountsV2<T>(): Promise<T> {
    throw new Error("not used");
  }
}

class ToggleMetadataProvider implements MeteoraMetadataProvider {
  fail = false;
  deferNextX = false;
  #release?: () => void;

  release(): void {
    this.#release?.();
    this.#release = undefined;
  }

  getPoolPage(
    _mint: string,
    orientation: MeteoraPoolOrientation,
    page: number,
  ): Promise<MeteoraPoolPage> {
    if (this.fail)
      return Promise.reject(new Error("fixture metadata unavailable"));
    if (orientation === "x" && this.deferNextX) {
      this.deferNextX = false;
      return new Promise((resolve) => {
        this.#release = () => resolve(this.page(orientation, page));
      });
    }
    return Promise.resolve(this.page(orientation, page));
  }

  private page(
    orientation: MeteoraPoolOrientation,
    page: number,
  ): MeteoraPoolPage {
    const pools =
      orientation === "x"
        ? [
            {
              address: oracle.address,
              name: "JUP-SOL",
              tokenXMint: JUP,
              tokenYMint: SOL,
              tvlUsd: 50_000,
              volume24hUsd: 9_000,
              blacklisted: false,
              observedAt: 1,
            },
          ]
        : [];
    return {
      orientation,
      currentPage: page,
      pageCount: page,
      pageSize: 20,
      total: pools.length,
      pools,
      exhausted: true,
      frontierTvlUsd: pools.at(-1)?.tvlUsd,
    };
  }
}

class OneQuoteProvider implements GeckoTerminalProvider {
  fail = false;

  getToken(): Promise<GeckoTokenMetadata> {
    throw new Error("not used");
  }
  getPools(): Promise<GeckoPoolCandidate[]> {
    throw new Error("not used");
  }
  getCandles(): Promise<GeckoCandle[]> {
    throw new Error("not used");
  }
  getQuotePrices(): Promise<Map<string, QuotePrice>> {
    if (this.fail)
      return Promise.reject(new Error("fixture quote unavailable"));
    return Promise.resolve(
      new Map([[SOL, { mint: SOL, priceUsd: 150, observedAt: 1 }]]),
    );
  }
}

function readySession(state: ReturnType<typeof useDlmmPools>["state"]) {
  if (state.status !== "ready") throw new Error("pool session not ready");
  return state.session;
}

function poolAccount(tokenXMint: string): string {
  const bytes = Uint8Array.from(atob(oracle.data), (value) =>
    value.charCodeAt(0),
  );
  bytes.set(decodeBase58(tokenXMint), 88);
  return btoa(String.fromCharCode(...bytes));
}

function account(data: string) {
  return {
    data: [data, "base64"] as [string, "base64"],
    executable: false,
    lamports: 1,
    owner: DLMM_PROGRAM_ID,
  };
}
