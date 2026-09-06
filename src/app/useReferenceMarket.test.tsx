import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  candleFixture,
  poolFixture,
  QUOTE_MINT,
  TOKEN_MINT,
  tokenFixture,
} from "../test/fixtures/geckoTerminal";
import {
  GeckoTerminalError,
  type GeckoTerminalProvider,
} from "../providers/geckoTerminal";
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
