import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadDlmmPoolSession,
  type DlmmPoolItem,
  type DlmmPoolSession,
} from "../domain/dlmmPools";
import {
  GeckoTerminalError,
  publicGeckoTerminalProvider,
  type GeckoTerminalProvider,
} from "../providers/geckoTerminal";
import {
  MeteoraMetadataError,
  publicMeteoraMetadataProvider,
  type MeteoraMetadataProvider,
} from "../providers/meteoraMetadata";
import { DlmmRpcDiscoveryError } from "../providers/meteoraRpc";
import { SolanaRpcError, type ReadOnlySolanaRpc } from "../providers/solanaRpc";

export type DlmmPoolsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      session: DlmmPoolSession;
      refreshing: boolean;
      actionError?: string;
    };

export function useDlmmPools(
  mint: string | undefined,
  rpc: ReadOnlySolanaRpc | undefined,
  metadataProvider: MeteoraMetadataProvider = publicMeteoraMetadataProvider,
  geckoProvider: GeckoTerminalProvider = publicGeckoTerminalProvider,
) {
  const [state, setState] = useState<DlmmPoolsState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const current = useRef<DlmmPoolSession | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    current.current = undefined;
    if (!mint || !rpc) {
      // State follows the external token/RPC request lifecycle.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle" });
      return;
    }

    const requestController = new AbortController();
    controller.current = requestController;
    setState({ status: "loading" });
    void loadDlmmPoolSession(
      rpc,
      metadataProvider,
      geckoProvider,
      mint,
      requestController.signal,
    ).then(
      (session) => {
        if (
          requestController.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        current.current = session;
        setState({ status: "ready", session, refreshing: false });
      },
      (error: unknown) => {
        if (
          requestController.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        setState({ status: "error", message: describeError(error) });
      },
    );

    return () => controller.current?.abort();
  }, [geckoProvider, metadataProvider, mint, reloadKey, rpc]);

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  const refresh = useCallback(async () => {
    const previous = current.current;
    if (!previous || !rpc) return;
    const requestGeneration = generation.current;
    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    setState({ status: "ready", session: previous, refreshing: true });

    try {
      const loaded = await loadDlmmPoolSession(
        rpc,
        metadataProvider,
        geckoProvider,
        previous.mint,
        requestController.signal,
      );
      if (
        requestController.signal.aborted ||
        generation.current !== requestGeneration
      )
        return;
      const latest = current.current;
      if (!latest || latest.mint !== loaded.mint) return;
      const session = preserveStableSelection(latest, loaded);
      current.current = session;
      setState({ status: "ready", session, refreshing: false });
    } catch (error) {
      if (
        requestController.signal.aborted ||
        generation.current !== requestGeneration
      )
        return;
      const latest = current.current ?? previous;
      const session = { ...latest, rpcStale: true };
      current.current = session;
      setState({
        status: "ready",
        session,
        refreshing: false,
        actionError: describeError(error),
      });
    }
  }, [geckoProvider, metadataProvider, rpc]);

  const toggle = useCallback((address: string) => {
    const previous = current.current;
    if (!previous || !previous.pools.some((pool) => pool.address === address))
      return;
    const enabled = new Set(previous.enabledAddresses);
    if (enabled.has(address)) enabled.delete(address);
    else enabled.add(address);
    const session: DlmmPoolSession = {
      ...previous,
      enabledAddresses: [...enabled],
      quoteStale: previous.pools.some(
        (pool) => enabled.has(pool.address) && pool.quoteStale,
      ),
      selectionState: "manual",
      selectionDetail:
        enabled.size > 0
          ? "Pool visibility follows your manual selection."
          : "No pool is enabled. Select any discovered pool to continue.",
    };
    current.current = session;
    setState((state) => ({
      status: "ready",
      session,
      refreshing: state.status === "ready" ? state.refreshing : false,
      actionError: state.status === "ready" ? state.actionError : undefined,
    }));
  }, []);

  return useMemo(
    () => ({ state, retry, refresh, toggle }),
    [refresh, retry, state, toggle],
  );
}

function preserveStableSelection(
  previous: DlmmPoolSession,
  loaded: DlmmPoolSession,
): DlmmPoolSession {
  const previousPools = new Map(
    previous.pools.map((pool) => [pool.address, pool]),
  );
  const loadedAddresses = new Set(loaded.pools.map((pool) => pool.address));
  const enabledAddresses = previous.enabledAddresses.filter((address) =>
    loadedAddresses.has(address),
  );
  const metadataStale =
    loaded.metadataState !== "complete" &&
    previous.pools.some((pool) => pool.metadata !== undefined);
  let quoteStale = false;

  const pools = loaded.pools.map((pool): DlmmPoolItem => {
    const prior = previousPools.get(pool.address);
    let next = pool;
    if (metadataStale && prior?.metadata) {
      next = { ...next, metadata: prior.metadata, rank: prior.rank };
    }
    if (
      enabledAddresses.includes(pool.address) &&
      !next.quotePrice &&
      prior?.quotePrice
    ) {
      quoteStale = true;
      next = {
        ...next,
        quotePrice: prior.quotePrice,
        quoteStale: true,
        qualification: prior.qualification,
        qualificationDetail: `${prior.qualificationDetail} Last-good conversion retained.`,
        positionCount: next.positionCount ?? prior.positionCount,
      };
    }
    return next;
  });

  const selectionState =
    previous.selectionState === "manual"
      ? "manual"
      : enabledAddresses.length === 0
        ? "manual-required"
        : previous.selectionState;
  return {
    ...loaded,
    pools,
    enabledAddresses,
    automaticSelectionAddress:
      previous.automaticSelectionAddress &&
      loadedAddresses.has(previous.automaticSelectionAddress)
        ? previous.automaticSelectionAddress
        : undefined,
    selectionState,
    selectionDetail:
      enabledAddresses.length === 0 && previous.selectionState !== "manual"
        ? "The prior selection is no longer present in RPC discovery. Choose a pool manually."
        : previous.selectionDetail,
    metadataStale,
    quoteStale,
  };
}

function describeError(error: unknown): string {
  return error instanceof SolanaRpcError ||
    error instanceof DlmmRpcDiscoveryError ||
    error instanceof MeteoraMetadataError ||
    error instanceof GeckoTerminalError
    ? error.message
    : "DLMM pools could not be loaded from this RPC.";
}
