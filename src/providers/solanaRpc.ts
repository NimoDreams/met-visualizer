import { requestJson } from "./http";

type JsonRpcId = number;

type JsonRpcResponse<T> =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: T }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId;
      error: { code: number; message: string; data?: unknown };
    };

export type AccountScanConfig = Readonly<Record<string, unknown>>;
export type MultipleAccountsConfig = Readonly<Record<string, unknown>>;

export interface ReadOnlySolanaRpc {
  getProgramAccounts<T>(
    programAddress: string,
    config: AccountScanConfig,
    signal?: AbortSignal,
  ): Promise<T>;
  getMultipleAccounts<T>(
    addresses: readonly string[],
    config: MultipleAccountsConfig,
    signal?: AbortSignal,
  ): Promise<T>;
  getProgramAccountsV2<T>(
    programAddress: string,
    config: AccountScanConfig,
    signal?: AbortSignal,
  ): Promise<T>;
}

type ReadMethod =
  "getProgramAccounts" | "getMultipleAccounts" | "getProgramAccountsV2";

export class NativeReadOnlySolanaRpc implements ReadOnlySolanaRpc {
  #nextId = 1;

  constructor(private readonly endpoint: URL) {
    if (endpoint.protocol !== "https:") {
      throw new Error("RPC endpoints must use HTTPS.");
    }
  }

  getProgramAccounts<T>(
    programAddress: string,
    config: AccountScanConfig,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.#request(
      "getProgramAccounts",
      [programAddress, config],
      signal,
    );
  }

  getMultipleAccounts<T>(
    addresses: readonly string[],
    config: MultipleAccountsConfig,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.#request("getMultipleAccounts", [addresses, config], signal);
  }

  getProgramAccountsV2<T>(
    programAddress: string,
    config: AccountScanConfig,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.#request(
      "getProgramAccountsV2",
      [programAddress, config],
      signal,
    );
  }

  async #request<T>(
    method: ReadMethod,
    params: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await requestJson<JsonRpcResponse<T>>(this.endpoint.href, {
      provider: "Solana RPC",
      signal,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.#nextId++,
          method,
          params,
        }),
      },
    });

    if ("error" in response) {
      throw new Error(`Solana RPC read failed (${response.error.code}).`);
    }

    return response.result;
  }
}
