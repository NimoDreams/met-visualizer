import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DlmmPoolItem } from "../domain/dlmmPools";
import {
  loadPoolPositionSession,
  type PoolPositionSession,
} from "../domain/poolPositions";
import type { GeckoTerminalProvider } from "../providers/geckoTerminal";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";
import { usePoolPositions } from "./usePoolPositions";

vi.mock("../domain/poolPositions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../domain/poolPositions")>();
  return { ...actual, loadPoolPositionSession: vi.fn() };
});

const load = vi.mocked(loadPoolPositionSession);
const rpc = {} as ReadOnlySolanaRpc;
const gecko = {} as GeckoTerminalProvider;

describe("usePoolPositions generations", () => {
  beforeEach(() => load.mockReset());

  it("aborts and ignores an obsolete pool load after replacement", async () => {
    const first = deferred<PoolPositionSession>();
    const second = deferred<PoolPositionSession>();
    load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ pool }) => usePoolPositions(rpc, pool, "mint", 1, gecko),
      { initialProps: { pool: poolItem("pool-a") } },
    );
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const firstSignal = load.mock.calls[0]?.[5];
    rerender({ pool: poolItem("pool-b") });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);

    act(() => second.resolve(session("pool-b")));
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "ready",
        session: { poolAddress: "pool-b" },
      }),
    );
    act(() => first.resolve(session("pool-a")));
    await Promise.resolve();
    expect(result.current.state).toMatchObject({
      status: "ready",
      session: { poolAddress: "pool-b" },
    });
  });

  it("cancels initial work and prevents later publication", async () => {
    const pending = deferred<PoolPositionSession>();
    load.mockReturnValueOnce(pending.promise);
    const pool = poolItem("pool");
    const { result } = renderHook(() =>
      usePoolPositions(rpc, pool, "mint", 1, gecko),
    );
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    act(() => result.current.cancel());
    expect(result.current.state.status).toBe("cancelled");
    expect(load.mock.calls[0]?.[5].aborted).toBe(true);
    act(() => pending.resolve(session("pool")));
    await Promise.resolve();
    expect(result.current.state.status).toBe("cancelled");
  });

  it("keeps last-good data stale after a refresh failure", async () => {
    load.mockResolvedValueOnce(session("pool"));
    const pool = poolItem("pool");
    const { result } = renderHook(() =>
      usePoolPositions(rpc, pool, "mint", 1, gecko),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    load.mockRejectedValueOnce(new Error("refresh unavailable"));
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "ready",
        refreshing: false,
        actionError: "refresh unavailable",
        session: { stale: true, poolAddress: "pool" },
      }),
    );
  });

  it("lets only the newest overlapping refresh publish", async () => {
    load.mockResolvedValueOnce(session("pool"));
    const pool = poolItem("pool");
    const { result } = renderHook(() =>
      usePoolPositions(rpc, pool, "mint", 1, gecko),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const older = deferred<PoolPositionSession>();
    const newer = deferred<PoolPositionSession>();
    load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    act(() => result.current.refresh());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    const olderSignal = load.mock.calls[1]?.[5];
    act(() => result.current.refresh());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(olderSignal?.aborted).toBe(true);

    const newest = { ...session("pool"), maximumSlot: 9 };
    act(() => newer.resolve(newest));
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "ready",
        session: { maximumSlot: 9 },
      }),
    );
    act(() => older.resolve({ ...session("pool"), maximumSlot: 3 }));
    await Promise.resolve();
    expect(result.current.state).toMatchObject({
      status: "ready",
      session: { maximumSlot: 9 },
    });
  });

  it("preserves the latest manual selection during a deferred refresh", async () => {
    const initial = {
      ...session("pool"),
      positions: [position("a"), position("b")],
      visibleCount: 2,
      selectedAddresses: ["a", "b"],
    };
    load.mockResolvedValueOnce(initial);
    const pool = poolItem("pool");
    const { result } = renderHook(() =>
      usePoolPositions(rpc, pool, "mint", 1, gecko),
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const pending = deferred<PoolPositionSession>();
    load.mockReturnValueOnce(pending.promise);
    act(() => result.current.refresh());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    act(() => result.current.toggle("a"));

    act(() =>
      pending.resolve({
        ...session("pool"),
        positions: [position("a"), position("b"), position("c")],
        visibleCount: 3,
        selectedAddresses: ["a", "b", "c"],
      }),
    );
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        status: "ready",
        session: { manualSelection: true, selectedAddresses: ["b"] },
      }),
    );
  });
});

function poolItem(address: string): DlmmPoolItem {
  return {
    address,
    discovery: {
      address,
      discoveredAs: ["x"],
      decodeState: "ready",
      tokenXMint: "mint",
      tokenYMint: "quote",
      reserveX: "x",
      reserveY: "y",
      activeId: 0,
      binStep: 100,
      status: 0,
    },
    qualification: "qualified",
    qualificationDetail: "fixture",
  };
}

function session(poolAddress: string): PoolPositionSession {
  return {
    poolAddress,
    positions: [],
    visibleCount: 0,
    selectedAddresses: [],
    manualSelection: false,
    discoveredCount: 0,
    valueCoverage: "complete",
    totalValueUsdMicros: 0n,
    missingBinCount: 0,
    binArrayCount: 0,
    minimumSlot: 1,
    maximumSlot: 2,
    requests: 3,
    bytes: 0,
    elapsedMs: 1,
    observedAt: 1,
    stale: false,
    loadingMode: "portable-batched",
    detail: "fixture",
  };
}

function position(address: string): PoolPositionSession["positions"][number] {
  return {
    address,
    owner: "owner",
    lowerBinId: 0,
    upperBinId: 0,
    valueUsdMicros: 1n,
    valuedBins: 1,
    nonzeroBins: 1,
    contributions: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
