import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  candleResponse,
  candleFixture,
  poolResponse,
  poolFixture,
  QUOTE_MINT,
  TOKEN_MINT,
  tokenFixture,
  tokenResponse,
} from "../test/fixtures/geckoTerminal";
import {
  GeckoTerminalError,
  PublicGeckoTerminalProvider,
  type GeckoTerminalProvider,
} from "../providers/geckoTerminal";
import { PublicRequestBudget } from "../providers/publicRequestBudget";
import { useReferenceMarket } from "./useReferenceMarket";

const NOW_SECONDS = Math.floor(Date.now() / 1_000);

describe("useReferenceMarket", () => {
  it.each([
    ["rate-limit", "rate-limit"],
    ["network", "network"],
    ["shape", "provider-shape"],
  ] as const)(
    "reports %s failures distinctly",
    async (providerKind, expected) => {
      const provider: GeckoTerminalProvider = {
        getToken: vi.fn(() =>
          Promise.reject(
            new GeckoTerminalError(providerKind, "fixture failure"),
          ),
        ),
        getPools: vi.fn(() => Promise.resolve([])),
        getCandles: vi.fn(() => Promise.resolve([])),
        getQuotePrices: vi.fn(() => Promise.resolve(new Map())),
      };
      const { result } = renderHook(() =>
        useReferenceMarket(TOKEN_MINT, undefined, provider),
      );

      await waitFor(() => expect(result.current.state.status).toBe("error"));
      if (result.current.state.status !== "error") throw new Error("not error");
      expect(result.current.state.kind).toBe(expected);
    },
  );

  it("reports an empty candidate list as no market", async () => {
    const provider: GeckoTerminalProvider = {
      getToken: vi.fn(() => Promise.resolve(tokenFixture())),
      getPools: vi.fn(() => Promise.resolve([])),
      getCandles: vi.fn(() => Promise.resolve([])),
      getQuotePrices: vi.fn(() => Promise.resolve(new Map())),
    };
    const { result } = renderHook(() =>
      useReferenceMarket(TOKEN_MINT, undefined, provider),
    );

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    if (result.current.state.status !== "error") throw new Error("not error");
    expect(result.current.state.kind).toBe("no-market");
  });

  it("does not let an older token request replace a newer session", async () => {
    let resolveFirst:
      ((value: ReturnType<typeof tokenFixture>) => void) | undefined;
    const firstToken = new Promise<ReturnType<typeof tokenFixture>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const market = poolFixture("race-pool");
    const provider: GeckoTerminalProvider = {
      getToken: vi.fn((mint: string) =>
        mint === TOKEN_MINT
          ? firstToken
          : Promise.resolve(
              tokenFixture({
                address: mint,
                name: "New token",
                symbol: "NEW",
              }),
            ),
      ),
      getPools: vi.fn(() => Promise.resolve([market])),
      getCandles: vi.fn(() =>
        Promise.resolve(candleFixture(NOW_SECONDS - 24 * 3_600, 96)),
      ),
      getQuotePrices: vi.fn(() => Promise.resolve(new Map())),
    };
    const { result, rerender } = renderHook(
      ({ mint }) => useReferenceMarket(mint, undefined, provider),
      { initialProps: { mint: TOKEN_MINT } },
    );

    rerender({ mint: QUOTE_MINT });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    if (result.current.state.status !== "ready") throw new Error("not ready");
    expect(result.current.state.session.token.symbol).toBe("NEW");

    await act(async () => {
      resolveFirst?.(tokenFixture());
      await firstToken;
    });
    expect(result.current.state.status).toBe("ready");
    if (result.current.state.status !== "ready") throw new Error("not ready");
    expect(result.current.state.session.token.symbol).toBe("NEW");
  });

  it("keeps a newer same-CA session alive when the replaced session aborts", async () => {
    const gate = deferred<void>();
    const transportSignals: AbortSignal[] = [];
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockImplementation(async (input, init) => {
        if (init?.signal) transportSignals.push(init.signal);
        await gate.promise;
        if (init?.signal?.aborted) {
          throw new DOMException("cancelled", "AbortError");
        }
        const url = requestUrl(input);
        const body = url.includes("/ohlcv/")
          ? candleResponse(candleFixture(NOW_SECONDS - 24 * 3_600, 96))
          : url.includes("/pools?")
            ? poolResponse("same-ca-pool")
            : tokenResponse();
        return Response.json(body);
      });
    const provider = new PublicGeckoTerminalProvider(new PublicRequestBudget());
    const oldSession = renderHook(() =>
      useReferenceMarket(TOKEN_MINT, undefined, provider),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const newSession = renderHook(() =>
      useReferenceMarket(TOKEN_MINT, undefined, provider),
    );
    oldSession.unmount();
    expect(transportSignals.every((signal) => !signal.aborted)).toBe(true);

    gate.resolve();
    await waitFor(() =>
      expect(newSession.result.current.state.status).toBe("ready"),
    );
    if (newSession.result.current.state.status !== "ready") {
      throw new Error("replacement session did not become ready");
    }
    expect(newSession.result.current.state.session.mint).toBe(TOKEN_MINT);
    expect(newSession.result.current.state.session.market.address).toBe(
      "same-ca-pool",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps last-good candles visible and marks them stale after refresh fails", async () => {
    const market = poolFixture("stale-pool");
    const getCandles = vi
      .fn()
      .mockResolvedValueOnce(candleFixture(NOW_SECONDS - 24 * 3_600, 96))
      .mockRejectedValueOnce(
        new GeckoTerminalError(
          "network",
          "GeckoTerminal could not be reached.",
        ),
      );
    const provider: GeckoTerminalProvider = {
      getToken: vi.fn(() => Promise.resolve(tokenFixture())),
      getPools: vi.fn(() => Promise.resolve([market])),
      getCandles,
      getQuotePrices: vi.fn(() => Promise.resolve(new Map())),
    };
    const { result } = renderHook(() =>
      useReferenceMarket(TOKEN_MINT, undefined, provider),
    );

    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const original =
      result.current.state.status === "ready"
        ? result.current.state.session.candles
        : [];
    await act(async () => result.current.refresh());

    expect(result.current.state.status).toBe("ready");
    if (result.current.state.status !== "ready") throw new Error("not ready");
    expect(result.current.state.stale).toBe(true);
    expect(result.current.state.session.candles).toBe(original);
    expect(result.current.state.actionError).toContain("could not be reached");
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolve) throw new Error("deferred promise was not initialized");
      resolve(value);
    },
  };
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}
