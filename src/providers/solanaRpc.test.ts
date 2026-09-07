import { beforeEach, describe, expect, it, vi } from "vitest";
import { RpcSessionManager } from "../app/session";
import {
  ACCOUNT_RPC_JSON_MAX_BYTES,
  MAX_RPC_ENDPOINT_CODE_UNITS,
  NativeReadOnlySolanaRpc,
  TOKEN_SUPPLY_JSON_MAX_BYTES,
  parseRpcEndpoint,
} from "./solanaRpc";

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
    expect(init).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
    expect(JSON.parse(requestBody)).toMatchObject({
      method: "getProgramAccounts",
    });
  });

  it("rejects a non-HTTPS RPC endpoint", () => {
    expect(
      () => new NativeReadOnlySolanaRpc(new URL("http://rpc.example.invalid")),
    ).toThrow("Use an HTTPS RPC endpoint.");
  });

  it("fails closed on redirects without exposing a path or query credential", async () => {
    const endpoint = "https://rpc.example.invalid/custom/path?key=private";
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockRejectedValue(new TypeError(`redirect blocked for ${endpoint}`));
    const client = new NativeReadOnlySolanaRpc(endpoint);

    const request = client.getProgramAccounts(
      "11111111111111111111111111111111",
      {},
    );
    await expect(request).rejects.toMatchObject({
      provider: "Solana RPC",
      kind: "network",
      message: "Solana RPC request could not be completed.",
    });
    await expect(request).rejects.not.toThrow(endpoint);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(endpoint);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
    });
  });

  it("cancels an active RPC request with a redacted AbortError", async () => {
    const endpoint = "https://rpc.example.invalid/path?key=private";
    vi.spyOn(window, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException(`aborted ${endpoint}`, "AbortError")),
          );
        }),
    );
    const controller = new AbortController();
    const client = new NativeReadOnlySolanaRpc(endpoint);
    const request = client.getProgramAccounts(
      "11111111111111111111111111111111",
      {},
      controller.signal,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({
      name: "AbortError",
      message: "Request was cancelled.",
    });
    await expect(request).rejects.not.toThrow(endpoint);
  });

  it("does not echo malformed provider error fields", async () => {
    const marker = "private-provider-error-marker";
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: marker, message: marker },
      }),
    );
    const client = new NativeReadOnlySolanaRpc(
      "https://rpc.example.invalid/path?key=private",
    );
    const request = client.getProgramAccounts(
      "11111111111111111111111111111111",
      {},
    );

    await expect(request).rejects.toThrow("Solana RPC read failed.");
    await expect(request).rejects.not.toThrow(marker);
  });

  it("accepts endpoint input at 4,096 UTF-16 units with a path and query", () => {
    const prefix = "https://rpc.example.invalid/custom/path?key=";
    const value = `${prefix}${"x".repeat(MAX_RPC_ENDPOINT_CODE_UNITS - prefix.length)}`;

    expect(value).toHaveLength(MAX_RPC_ENDPOINT_CODE_UNITS);
    expect(parseRpcEndpoint(value)).toMatchObject({
      pathname: "/custom/path",
      search: `?key=${"x".repeat(MAX_RPC_ENDPOINT_CODE_UNITS - prefix.length)}`,
    });
  });

  it("rejects endpoint input above 4,096 UTF-16 units without echoing it", () => {
    const prefix = "https://rpc.example.invalid/?private=";
    const value = `${prefix}${"x".repeat(MAX_RPC_ENDPOINT_CODE_UNITS + 1 - prefix.length)}`;

    expect(value).toHaveLength(MAX_RPC_ENDPOINT_CODE_UNITS + 1);
    expect(() => parseRpcEndpoint(value)).toThrow(
      "RPC endpoint must be 4,096 characters or fewer.",
    );
    try {
      parseRpcEndpoint(value);
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });

  it.each([
    ["username", "https://user@127.0.0.1/path?key=ok"],
    ["password", "https://user:password@127.0.0.1/path?key=ok"],
    ["fragment", "https://rpc.example.invalid/path?key=ok#private"],
    ["empty fragment", "https://rpc.example.invalid/path?key=ok#"],
  ])("rejects an endpoint containing a %s", (_label, value) => {
    expect(() => parseRpcEndpoint(value)).toThrow(/cannot include/);
    try {
      parseRpcEndpoint(value);
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });

  it("uses the 64 KiB token-supply response limit", async () => {
    const fetchMock = vi.spyOn(window, "fetch");
    const client = new NativeReadOnlySolanaRpc(
      "https://rpc.example.invalid/path?key=private",
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: {} } }),
        { headers: { "Content-Length": String(TOKEN_SUPPLY_JSON_MAX_BYTES) } },
      ),
    );
    await expect(client.getTokenSupply("mint")).resolves.toEqual({ value: {} });

    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        headers: {
          "Content-Length": String(TOKEN_SUPPLY_JSON_MAX_BYTES + 1),
        },
      }),
    );
    await expect(client.getTokenSupply("mint")).rejects.toMatchObject({
      kind: "limit",
      message: "Solana RPC response exceeded the safe size limit.",
    });
  });

  it("uses the 24 MiB account-method response limit", async () => {
    const fetchMock = vi.spyOn(window, "fetch");
    const client = new NativeReadOnlySolanaRpc(
      "https://rpc.example.invalid/path?key=private",
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [] }), {
        headers: { "Content-Length": String(ACCOUNT_RPC_JSON_MAX_BYTES) },
      }),
    );
    await expect(client.getProgramAccounts("program", {})).resolves.toEqual([]);

    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        headers: {
          "Content-Length": String(ACCOUNT_RPC_JSON_MAX_BYTES + 1),
        },
      }),
    );
    await expect(client.getMultipleAccounts([], {})).rejects.toMatchObject({
      kind: "limit",
      message: "Solana RPC response exceeded the safe size limit.",
    });
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
