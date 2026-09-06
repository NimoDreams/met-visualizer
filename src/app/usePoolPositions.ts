import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DlmmPoolItem } from "../domain/dlmmPools";
import {
  loadPoolPositionSession,
  revealPositions,
  togglePositionSelection,
  type PoolPositionSession,
} from "../domain/poolPositions";
import {
  publicGeckoTerminalProvider,
  type GeckoTerminalProvider,
} from "../providers/geckoTerminal";
import type { PositionRpcProgress } from "../providers/positionRpc";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";

export type PoolPositionsState =
  | { status: "loading"; progress: PositionRpcProgress }
  | { status: "cancelled"; progress: PositionRpcProgress }
  | { status: "error"; message: string }
  | {
      status: "ready";
      session: PoolPositionSession;
      refreshing: boolean;
      actionError?: string;
    };

const emptyProgress: PositionRpcProgress = {
  discovered: 0,
  hydrated: 0,
  requests: 0,
  bytes: 0,
};

export function usePoolPositions(
  rpc: ReadOnlySolanaRpc,
  pool: DlmmPoolItem,
  enteredMint: string,
  minContextSlot: number,
  gecko: GeckoTerminalProvider = publicGeckoTerminalProvider,
) {
  const generation = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const current = useRef<PoolPositionSession | undefined>(undefined);
  const poolRef = useRef(pool);
  const identity = useRef<
    | {
        rpc: ReadOnlySolanaRpc;
        enteredMint: string;
        poolAddress: string;
      }
    | undefined
  >(undefined);
  const progress = useRef(emptyProgress);
  const [state, setState] = useState<PoolPositionsState>({
    status: "loading",
    progress: emptyProgress,
  });

  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  const run = useCallback(
    async (refreshing: boolean) => {
      const requestGeneration = ++generation.current;
      controller.current?.abort();
      const requestController = new AbortController();
      controller.current = requestController;
      progress.current = emptyProgress;
      const previous = current.current;
      const activePool = poolRef.current;
      const requestedMinSlot = Math.max(
        minContextSlot,
        previous?.poolAddress === activePool.address ? previous.maximumSlot : 0,
      );
      setState(
        refreshing && previous
          ? { status: "ready", session: previous, refreshing: true }
          : { status: "loading", progress: emptyProgress },
      );
      try {
        const loaded = await loadPoolPositionSession(
          rpc,
          gecko,
          activePool,
          enteredMint,
          requestedMinSlot,
          requestController.signal,
          (next) => {
            progress.current = next;
            if (
              !refreshing &&
              generation.current === requestGeneration &&
              !requestController.signal.aborted
            )
              setState({ status: "loading", progress: next });
          },
          refreshing,
        );
        if (
          requestController.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        const latest = current.current;
        const session =
          refreshing && latest
            ? preservePositionSelection(latest, loaded)
            : loaded;
        current.current = session;
        setState({ status: "ready", session, refreshing: false });
      } catch (error) {
        if (
          requestController.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        if (previous) {
          const stale = { ...(current.current ?? previous), stale: true };
          current.current = stale;
          setState({
            status: "ready",
            session: stale,
            refreshing: false,
            actionError: describeError(error),
          });
        } else setState({ status: "error", message: describeError(error) });
      }
    },
    [enteredMint, gecko, minContextSlot, rpc],
  );

  useEffect(() => {
    const previousIdentity = identity.current;
    const samePoolSession =
      previousIdentity?.rpc === rpc &&
      previousIdentity.enteredMint === enteredMint &&
      previousIdentity.poolAddress === pool.address &&
      current.current?.poolAddress === pool.address;
    identity.current = { rpc, enteredMint, poolAddress: pool.address };
    if (!samePoolSession) current.current = undefined;
    void run(Boolean(samePoolSession));
    return () => controller.current?.abort();
  }, [enteredMint, pool.address, rpc, run]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    generation.current += 1;
    setState((state) => {
      if (state.status === "loading")
        return { status: "cancelled", progress: state.progress };
      if (state.status === "ready" && state.refreshing)
        return { ...state, refreshing: false };
      return state;
    });
  }, []);

  const restart = useCallback(() => void run(false), [run]);
  const refresh = useCallback(() => void run(true), [run]);
  const reveal = useCallback((mode: "next" | "all") => {
    const previous = current.current;
    if (!previous) return;
    const next = revealPositions(previous, mode);
    current.current = next;
    setState((state) => ({
      status: "ready",
      session: next,
      refreshing: state.status === "ready" ? state.refreshing : false,
      actionError: state.status === "ready" ? state.actionError : undefined,
    }));
  }, []);
  const toggle = useCallback((address: string) => {
    const previous = current.current;
    if (!previous) return;
    const next = togglePositionSelection(previous, address);
    current.current = next;
    setState((state) => ({
      status: "ready",
      session: next,
      refreshing: state.status === "ready" ? state.refreshing : false,
      actionError: state.status === "ready" ? state.actionError : undefined,
    }));
  }, []);

  return useMemo(
    () => ({ state, cancel, restart, refresh, reveal, toggle }),
    [cancel, refresh, restart, reveal, state, toggle],
  );
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Positions could not be loaded from this RPC.";
}

function preservePositionSelection(
  previous: PoolPositionSession,
  loaded: PoolPositionSession,
): PoolPositionSession {
  const available = new Set(loaded.positions.map(({ address }) => address));
  const visibleCount = Math.min(
    loaded.positions.length,
    Math.max(previous.visibleCount, loaded.visibleCount),
  );
  if (!previous.manualSelection)
    return {
      ...loaded,
      visibleCount,
      selectedAddresses: loaded.positions
        .slice(0, visibleCount)
        .map(({ address }) => address),
    };
  return {
    ...loaded,
    visibleCount,
    manualSelection: true,
    selectedAddresses: previous.selectedAddresses.filter((address) =>
      available.has(address),
    ),
  };
}
