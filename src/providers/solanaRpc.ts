import { ProviderRequestError, requestJson } from "./http";

export const MAX_RPC_ENDPOINT_CODE_UNITS = 4_096;
export const TOKEN_SUPPLY_JSON_MAX_BYTES = 64 * 1024;
export const ACCOUNT_RPC_JSON_MAX_BYTES = 24 * 1024 * 1024;

type JsonRpcId = number;

export type SolanaRpcErrorKind =
  "timeout" | "network" | "http" | "rpc" | "limit" | "malformed";

export class SolanaRpcError extends Error {
  readonly provider = "Solana RPC";

  constructor(
    readonly kind: SolanaRpcErrorKind,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(solanaRpcErrorMessage(kind, status, code));
    this.name = "SolanaRpcError";
  }
}

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
    const requestId = this.#nextId++;
    let response: unknown;
    try {
      response = await requestJson<unknown>(this.#endpoint.href, {
        provider: "Solana RPC",
        signal,
        maxResponseBytes:
          method === "getTokenSupply"
            ? TOKEN_SUPPLY_JSON_MAX_BYTES
            : ACCOUNT_RPC_JSON_MAX_BYTES,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          redirect: "error",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            method,
            params,
          }),
        },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw normalizeTransportError(error);
    }

    return readJsonRpcEnvelope<T>(response, requestId);
  }
}

function readJsonRpcEnvelope<T>(value: unknown, requestId: JsonRpcId): T {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || value.id !== requestId) {
    throw malformedRpcResponse();
  }

  const hasResult = Object.hasOwn(value, "result");
  const hasError = Object.hasOwn(value, "error");
  if (hasResult === hasError) throw malformedRpcResponse();

  if (hasResult) return value.result as T;

  const error = value.error;
  if (
    !isRecord(error) ||
    typeof error.code !== "number" ||
    !Number.isSafeInteger(error.code) ||
    typeof error.message !== "string"
  ) {
    throw malformedRpcResponse();
  }
  const code = error.code;
  throw new SolanaRpcError("rpc", undefined, code);
}

function normalizeTransportError(error: unknown): SolanaRpcError {
  if (!(error instanceof ProviderRequestError)) {
    return new SolanaRpcError("network");
  }
  if (error.kind === "timeout") {
    return new SolanaRpcError("timeout");
  }
  if (error.kind === "limit") {
    return new SolanaRpcError("limit");
  }
  if (error.kind === "invalid-json") return malformedRpcResponse();
  if (error.status !== undefined) {
    return new SolanaRpcError("http", error.status);
  }
  return new SolanaRpcError("network");
}

function malformedRpcResponse(): SolanaRpcError {
  return new SolanaRpcError("malformed");
}

function solanaRpcErrorMessage(
  kind: SolanaRpcErrorKind,
  status?: number,
  code?: number,
): string {
  if (kind === "timeout") return "Solana RPC request timed out.";
  if (kind === "network") return "Solana RPC request could not be completed.";
  if (kind === "limit")
    return "Solana RPC response exceeded the safe size limit.";
  if (kind === "malformed") return "Solana RPC response is malformed.";
  if (kind === "http")
    return Number.isSafeInteger(status)
      ? `Solana RPC request failed with HTTP ${status}.`
      : "Solana RPC request failed.";
  return Number.isSafeInteger(code)
    ? `Solana RPC read failed (${code}).`
    : "Solana RPC read failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
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
