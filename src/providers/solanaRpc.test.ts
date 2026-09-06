import { beforeEach, describe, expect, it, vi } from "vitest";
import { RpcSessionManager } from "../app/session";
import { NativeReadOnlySolanaRpc } from "./solanaRpc";

describe("NativeReadOnlySolanaRpc", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends only an approved read method and forwards the abort signal", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: ["account"] }),
          { status: 200 },
        ),
      );
    const controller = new AbortController();
    const client = new NativeReadOnlySolanaRpc(
      new URL("https://rpc.example.invalid/"),
    );

    await expect(
      client.getProgramAccounts(
        "11111111111111111111111111111111",
        { encoding: "base64" },
        controller.signal,
      ),
    ).resolves.toEqual(["account"]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const requestBody = typeof init?.body === "string" ? init.body : "";
    expect(url).toBe("https://rpc.example.invalid/");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(requestBody)).toMatchObject({
      method: "getProgramAccounts",
    });
  });

  it("rejects a non-HTTPS RPC endpoint", () => {
    expect(
      () => new NativeReadOnlySolanaRpc(new URL("http://rpc.example.invalid")),
    ).toThrow("RPC endpoints must use HTTPS.");
  });

  it("reads current mint supply through the same narrow RPC boundary", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { value: { amount: "420000000", decimals: 6 } },
      }),
    );
    const client = new NativeReadOnlySolanaRpc(
      new URL("https://rpc.example.invalid/"),
    );

    await client.getTokenSupply(
      "So11111111111111111111111111111111111111112",
      undefined,
      { commitment: "confirmed", minContextSlot: 42 },
    );

    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== "string") throw new Error("missing RPC body");
    expect(JSON.parse(requestBody)).toMatchObject({
      method: "getTokenSupply",
      params: [
        "So11111111111111111111111111111111111111112",
        { commitment: "confirmed", minContextSlot: 42 },
      ],
    });
  });
});

describe("RpcSessionManager", () => {
  it("aborts the old session when an RPC is replaced or disconnected", () => {
    const manager = new RpcSessionManager();
    const first = manager.connect("https://first-rpc.example.invalid");
    const second = manager.connect("https://second-rpc.example.invalid");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    manager.disconnect();
    expect(second.signal.aborted).toBe(true);
  });
});
