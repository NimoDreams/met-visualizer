import { requestJson } from "./http";

export const MAX_RPC_ENDPOINT_CODE_UNITS = 4_096;
export const TOKEN_SUPPLY_JSON_MAX_BYTES = 64 * 1024;
export const ACCOUNT_RPC_JSON_MAX_BYTES = 24 * 1024 * 1024;

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
  getTokenSupply<T>(
    mint: string,
    signal?: AbortSignal,
    config?: AccountScanConfig,
  ): Promise<T>;
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
  | "getTokenSupply"
  | "getProgramAccounts"
  | "getMultipleAccounts"
  | "getProgramAccountsV2";

export class NativeReadOnlySolanaRpc implements ReadOnlySolanaRpc {
  #nextId = 1;
  readonly #endpoint: URL;

  constructor(endpoint: URL | string) {
    this.#endpoint = parseRpcEndpoint(
      typeof endpoint === "string" ? endpoint : endpoint.href,
    );
  }

  getTokenSupply<T>(
    mint: string,
    signal?: AbortSignal,
    config: AccountScanConfig = {},
  ): Promise<T> {
    return this.#request(
      "getTokenSupply",
      [mint, { commitment: "confirmed", ...config }],
      signal,
    );
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
    const response = await requestJson<JsonRpcResponse<T>>(
      this.#endpoint.href,
      {
        provider: "Solana RPC",
        signal,
        maxResponseBytes:
          method === "getTokenSupply"
            ? TOKEN_SUPPLY_JSON_MAX_BYTES
            : ACCOUNT_RPC_JSON_MAX_BYTES,
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
      },
    );

    if ("error" in response) {
      throw new Error(`Solana RPC read failed (${response.error.code}).`);
    }

    return response.result;
  }
}

export class RpcEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcEndpointError";
  }
}

export function parseRpcEndpoint(value: string): URL {
  if (value.length > MAX_RPC_ENDPOINT_CODE_UNITS) {
    throw new RpcEndpointError(
      "RPC endpoint must be 4,096 characters or fewer.",
    );
  }

  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new RpcEndpointError("Enter a complete HTTPS RPC endpoint.");
  }

  if (endpoint.protocol !== "https:") {
    throw new RpcEndpointError("Use an HTTPS RPC endpoint.");
  }
  if (endpoint.username || endpoint.password) {
    throw new RpcEndpointError("RPC endpoint cannot include credentials.");
  }
  if (value.includes("#")) {
    throw new RpcEndpointError("RPC endpoint cannot include a fragment.");
  }
  return endpoint;
}
