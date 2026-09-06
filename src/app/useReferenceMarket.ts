import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadMarketCandles,
  loadOlderCandles,
  loadReferenceMarket,
  NoReferenceMarketError,
  refreshReferenceMarket,
  type ReferenceMarketSession,
} from "../domain/referenceMarket";
import {
  GeckoTerminalError,
  PublicGeckoTerminalProvider,
  type CandleInterval,
  type GeckoTerminalProvider,
} from "../providers/geckoTerminal";
import type { ReadOnlySolanaRpc } from "../providers/solanaRpc";

export type ReferenceMarketErrorKind =
  "no-market" | "rate-limit" | "network" | "provider-shape" | "provider";

export type ReferenceMarketState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "error";
      kind: ReferenceMarketErrorKind;
      message: string;
    }
  | {
      status: "ready";
      session: ReferenceMarketSession;
      action: "idle" | "refreshing" | "changing" | "backfilling";
      stale: boolean;
      actionError?: string;
    };

const defaultProvider = new PublicGeckoTerminalProvider();

export function useReferenceMarket(
  mint: string | undefined,
  rpc: ReadOnlySolanaRpc | undefined,
  provider: GeckoTerminalProvider = defaultProvider,
) {
  const [state, setState] = useState<ReferenceMarketState>({ status: "idle" });
  const sessionController = useRef<AbortController | undefined>(undefined);
  const actionController = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const currentSession = useRef<ReferenceMarketSession | undefined>(undefined);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    sessionController.current?.abort();
    actionController.current?.abort();
    currentSession.current = undefined;

    if (!mint) {
      // This reset belongs to the external request lifecycle managed here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    sessionController.current = controller;
    setState({ status: "loading" });

    void loadReferenceMarket(provider, rpc, mint, controller.signal).then(
      (session) => {
        if (
          controller.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        currentSession.current = session;
        setState({
          status: "ready",
          session,
          action: "idle",
          stale: false,
        });
      },
      (error: unknown) => {
        if (
          controller.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        setState({ status: "error", ...describeError(error) });
      },
    );

    return () => controller.abort();
  }, [mint, provider, rpc]);

  const update = useCallback(
    async (
      action: "refreshing" | "changing" | "backfilling",
      run: (
        session: ReferenceMarketSession,
        signal: AbortSignal,
      ) => Promise<ReferenceMarketSession>,
    ) => {
      const previous = currentSession.current;
      if (!previous) return;

      const requestGeneration = generation.current;
      actionController.current?.abort();
      const controller = new AbortController();
      actionController.current = controller;
      setState({
        status: "ready",
        session: previous,
        action,
        stale: false,
      });

      try {
        const next = await run(previous, controller.signal);
        if (
          controller.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        currentSession.current = next;
        setState({
          status: "ready",
          session: next,
          action: "idle",
          stale: false,
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          generation.current !== requestGeneration
        )
          return;
        setState({
          status: "ready",
          session: previous,
          action: "idle",
          stale: action === "refreshing",
          actionError: describeError(error).message,
        });
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    await update("refreshing", (session, signal) =>
      refreshReferenceMarket(provider, session, signal),
    );
  }, [provider, update]);

  const changeInterval = useCallback(
    async (interval: CandleInterval) => {
      const session = currentSession.current;
      if (!session || interval === session.interval) return;
      await update("changing", (current, signal) =>
        loadMarketCandles(
          provider,
          current,
          current.market,
          interval,
          signal,
          "user",
        ),
      );
    },
    [provider, update],
  );

  const changeMarket = useCallback(
    async (address: string) => {
      const session = currentSession.current;
      const market = session?.candidates.find(
        (candidate) => candidate.address === address,
      );
      if (!session || !market || market.address === session.market.address)
        return;
      await update("changing", (current, signal) =>
        loadMarketCandles(
          provider,
          current,
          market,
          current.interval,
          signal,
          "user",
        ),
      );
    },
    [provider, update],
  );

  const loadOlder = useCallback(async () => {
    await update("backfilling", (session, signal) =>
      loadOlderCandles(provider, session, signal),
    );
  }, [provider, update]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const poll = () => {
      const session = currentSession.current;
      if (
        !document.hidden &&
        session &&
        Date.now() - session.observedAt >= 60_000
      ) {
        void refresh();
      }
    };
    const timer = window.setInterval(poll, 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh, state.status]);

  return useMemo(
    () => ({ state, refresh, changeInterval, changeMarket, loadOlder }),
    [changeInterval, changeMarket, loadOlder, refresh, state],
  );
}

function describeError(error: unknown): {
  kind: ReferenceMarketErrorKind;
  message: string;
} {
  if (error instanceof NoReferenceMarketError) {
    return { kind: "no-market", message: error.message };
  }
  if (error instanceof GeckoTerminalError) {
    const kind =
      error.kind === "shape"
        ? "provider-shape"
        : error.kind === "not-found"
          ? "no-market"
          : error.kind;
    return { kind, message: error.message };
  }
  return {
    kind: "provider",
    message: "Reference-market data could not be loaded.",
  };
}
