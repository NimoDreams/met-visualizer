import {
  BIN_ARRAY_DISCRIMINATOR,
  DLMM_PROGRAM_ID,
  POSITION_V2_DISCRIMINATOR,
} from "../domain/meteoraAccounts";
import type { EncodedPositionForValuation } from "../domain/positionValuation";
import { assertCanonicalSolanaAddress } from "../domain/solanaAddress";
import {
  MAX_BIN_ARRAYS_PER_POOL,
  MAX_POSITIONS_PER_POOL,
  validateDlmmAccountEnvelope,
  validateProgramAccounts,
} from "./rpcAccountEnvelope";
import type { ReadOnlySolanaRpc } from "./solanaRpc";
import { MAX_SPL_DECIMALS } from "../domain/providerLimits";

const POSITION_POOL_OFFSET = 8;
const BIN_ARRAY_POOL_OFFSET = 24;
const BATCH_SIZE = 100;
type ContextResult<T> = { context: { slot: number }; value: T };
type TokenSupplyResult = ContextResult<{ decimals: number }>;

export type PositionRpcProgress = {
  discovered: number;
  hydrated: number;
  requests: number;
  bytes: number;
};

export type PositionRpcSnapshot = {
  positionAccounts: EncodedPositionForValuation[];
  binArrayData: string[];
  discoveredCount: number;
  completePositionSet: boolean;
  quoteDecimals: number;
  minimumSlot: number;
  maximumSlot: number;
  requests: number;
  bytes: number;
};

export async function loadPositionRpcSnapshot(
  rpc: ReadOnlySolanaRpc,
  poolAddress: string,
  quoteMint: string,
  minContextSlot: number,
  signal: AbortSignal,
  onProgress?: (progress: PositionRpcProgress) => void,
): Promise<PositionRpcSnapshot> {
  assertCanonicalSolanaAddress(poolAddress, "Pool address");
  assertCanonicalSolanaAddress(quoteMint, "Quote mint");
  validateSafeSlot(minContextSlot, "requested minimum context");
  const started = { requests: 0, bytes: 0 };
  const keyResponse = await rpc.getProgramAccounts<ContextResult<unknown[]>>(
    DLMM_PROGRAM_ID,
    {
      commitment: "confirmed",
      encoding: "base64",
      withContext: true,
      minContextSlot,
      dataSlice: { offset: 0, length: 0 },
      filters: [
        { memcmp: { offset: 0, bytes: POSITION_V2_DISCRIMINATOR } },
        { memcmp: { offset: POSITION_POOL_OFFSET, bytes: poolAddress } },
      ],
    },
    signal,
  );
  throwIfAborted(signal);
  started.requests += 1;
  validateContext(keyResponse, minContextSlot, "position discovery");
  const addresses = validateProgramAccounts(
    keyResponse.value,
    "RPC position discovery",
    "empty",
    MAX_POSITIONS_PER_POOL,
  )
    .map(({ pubkey }) => pubkey)
    .sort();
  let minimumSlot = keyResponse.context.slot;
  let maximumSlot = keyResponse.context.slot;
  const positionAccounts: EncodedPositionForValuation[] = [];
  let completePositionSet = true;
  onProgress?.({
    discovered: addresses.length,
    hydrated: 0,
    ...started,
  });

  for (let offset = 0; offset < addresses.length; offset += BATCH_SIZE) {
    throwIfAborted(signal);
    const batch = addresses.slice(offset, offset + BATCH_SIZE);
    const response = await rpc.getMultipleAccounts<ContextResult<unknown[]>>(
      batch,
      {
        commitment: "confirmed",
        encoding: "base64",
        minContextSlot: maximumSlot,
      },
      signal,
    );
    throwIfAborted(signal);
    started.requests += 1;
    validateContext(response, maximumSlot, "position hydration");
    if (response.value.length !== batch.length)
      throw new Error("RPC position hydration returned an incomplete batch.");
    minimumSlot = Math.min(minimumSlot, response.context.slot);
    maximumSlot = Math.max(maximumSlot, response.context.slot);
    response.value.forEach((account, index) => {
      if (account === null) {
        completePositionSet = false;
        return;
      }
      const { account: validated, decodedBytes } = validateDlmmAccountEnvelope(
        account,
        "PositionV2",
        "PositionV2",
      );
      started.bytes += decodedBytes;
      positionAccounts.push({
        address: batch[index]!,
        data: validated.data[0],
      });
    });
    onProgress?.({
      discovered: addresses.length,
      hydrated: Math.min(offset + batch.length, addresses.length),
      ...started,
    });
  }

  const [binResponse, supplyResponse] = await Promise.all([
    rpc.getProgramAccounts<ContextResult<unknown[]>>(
      DLMM_PROGRAM_ID,
      {
        commitment: "confirmed",
        encoding: "base64",
        withContext: true,
        minContextSlot: maximumSlot,
        filters: [
          { memcmp: { offset: 0, bytes: BIN_ARRAY_DISCRIMINATOR } },
          { memcmp: { offset: BIN_ARRAY_POOL_OFFSET, bytes: poolAddress } },
        ],
      },
      signal,
    ),
    rpc.getTokenSupply<TokenSupplyResult>(quoteMint, signal, {
      commitment: "confirmed",
      minContextSlot: maximumSlot,
    }),
  ]);
  throwIfAborted(signal);
  started.requests += 2;
  validateContext(binResponse, maximumSlot, "bin-array hydration");
  validateTokenSupply(supplyResponse, maximumSlot);
  minimumSlot = Math.min(
    minimumSlot,
    binResponse.context.slot,
    supplyResponse.context.slot,
  );
  maximumSlot = Math.max(
    maximumSlot,
    binResponse.context.slot,
    supplyResponse.context.slot,
  );
  const binAccounts = validateProgramAccounts(
    binResponse.value,
    "RPC BinArray scan",
    "BinArray",
    MAX_BIN_ARRAYS_PER_POOL,
  );
  const binArrayData = binAccounts.map(({ account, decodedBytes }) => {
    started.bytes += decodedBytes;
    return account.data[0];
  });

  return {
    positionAccounts,
    binArrayData,
    discoveredCount: addresses.length,
    completePositionSet:
      completePositionSet && positionAccounts.length === addresses.length,
    quoteDecimals: supplyResponse.value.decimals,
    minimumSlot,
    maximumSlot,
    ...started,
  };
}

function validateContext(
  result: ContextResult<unknown>,
  minContextSlot: number,
  operation: string,
): void {
  if (
    !result?.context ||
    !isSafeSlot(result.context.slot) ||
    !Array.isArray(result.value)
  )
    throw new Error(`RPC ${operation} response is malformed.`);
  if (result.context.slot < minContextSlot)
    throw new Error(`RPC ${operation} violated its minimum context slot.`);
}

function validateTokenSupply(
  result: TokenSupplyResult,
  minContextSlot: number,
): void {
  if (
    !result?.context ||
    !isSafeSlot(result.context.slot) ||
    result.context.slot < minContextSlot ||
    !Number.isInteger(result.value?.decimals) ||
    result.value.decimals < 0 ||
    result.value.decimals > MAX_SPL_DECIMALS
  )
    throw new Error("RPC token-supply response is stale or malformed.");
}

function validateSafeSlot(slot: number, operation: string): void {
  if (!isSafeSlot(slot)) {
    throw new Error(`RPC ${operation} slot is malformed.`);
  }
}

function isSafeSlot(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
