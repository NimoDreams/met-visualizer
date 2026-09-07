import type { ReadOnlySolanaRpc } from "./solanaRpc";
import {
  decodeLbPairAccount,
  DLMM_PROGRAM_ID,
  LB_PAIR_DISCRIMINATOR,
  POSITION_V2_DISCRIMINATOR,
  type DecodedLbPair,
} from "../domain/meteoraAccounts";
import { assertCanonicalSolanaAddress } from "../domain/solanaAddress";
import {
  MAX_DLMM_POOLS_PER_TOKEN,
  MAX_POSITIONS_PER_POOL,
  validateDlmmAccountEnvelope,
  validateProgramAccounts,
} from "./rpcAccountEnvelope";

const TOKEN_X_OFFSET = 88;
const TOKEN_Y_OFFSET = 120;
const POSITION_POOL_OFFSET = 8;
const ACCOUNT_BATCH_SIZE = 100;
type ContextResult<T> = { context: { slot: number }; value: T };

export type DiscoveredDlmmPool = DecodedLbPair & {
  address: string;
  discoveredAs: Array<"x" | "y">;
  decodeState: "ready";
};

export type UnavailableDlmmPool = {
  address: string;
  discoveredAs: Array<"x" | "y">;
  decodeState: "unavailable";
  reason: string;
};

export type DlmmPoolDiscovery = {
  pools: Array<DiscoveredDlmmPool | UnavailableDlmmPool>;
  minimumSlot: number;
  maximumSlot: number;
  missingAccounts: number;
};

export class DlmmRpcDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DlmmRpcDiscoveryError";
  }
}

export async function discoverDlmmPools(
  rpc: ReadOnlySolanaRpc,
  mint: string,
  signal: AbortSignal,
): Promise<DlmmPoolDiscovery> {
  assertCanonicalSolanaAddress(mint, "Token mint");
  const [asX, asY] = await Promise.all([
    scanPools(rpc, mint, "x", signal),
    scanPools(rpc, mint, "y", signal),
  ]);
  const minimumContextSlot = Math.max(asX.slot, asY.slot);
  const orientations = new Map<string, Set<"x" | "y">>();
  for (const { address, orientation } of [...asX.keys, ...asY.keys]) {
    const values = orientations.get(address) ?? new Set<"x" | "y">();
    values.add(orientation);
    orientations.set(address, values);
  }

  if (orientations.size > MAX_DLMM_POOLS_PER_TOKEN) {
    throw new DlmmRpcDiscoveryError(
      "RPC token pool discovery exceeds the supported pool limit.",
    );
  }

  const addresses = [...orientations.keys()].sort();
  const pools: Array<DiscoveredDlmmPool | UnavailableDlmmPool> = [];
  let minimumSlot = Math.min(asX.slot, asY.slot);
  let maximumSlot = Math.max(asX.slot, asY.slot);
  let missingAccounts = 0;

  for (let index = 0; index < addresses.length; index += ACCOUNT_BATCH_SIZE) {
    const batch = addresses.slice(index, index + ACCOUNT_BATCH_SIZE);
    const response = await rpc.getMultipleAccounts<ContextResult<unknown[]>>(
      batch,
      {
        commitment: "confirmed",
        encoding: "base64",
        minContextSlot: minimumContextSlot,
      },
      signal,
    );
    validateContext(response, "pool hydration");
    minimumSlot = Math.min(minimumSlot, response.context.slot);
    maximumSlot = Math.max(maximumSlot, response.context.slot);
    if (response.value.length !== batch.length) {
      throw new DlmmRpcDiscoveryError(
        "RPC pool hydration returned an incomplete account batch.",
      );
    }

    response.value.forEach((account, accountIndex) => {
      const address = batch[accountIndex];
      if (!address) return;
      const discoveredAs = [...(orientations.get(address) ?? [])].sort();
      if (account === null) {
        missingAccounts += 1;
        pools.push({
          address,
          discoveredAs,
          decodeState: "unavailable",
          reason: "Account disappeared before hydration.",
        });
        return;
      }
      try {
        const { account: validated } = validateDlmmAccountEnvelope(
          account,
          "LB pair",
          "LB pair",
        );
        const decoded = decodeLbPairAccount(validated.data[0]);
        if (
          (discoveredAs.includes("x") && decoded.tokenXMint !== mint) ||
          (discoveredAs.includes("y") && decoded.tokenYMint !== mint)
        ) {
          throw new DlmmRpcDiscoveryError(
            "Decoded mint orientation does not match the RPC filter.",
          );
        }
        pools.push({ address, discoveredAs, decodeState: "ready", ...decoded });
      } catch (error) {
        pools.push({
          address,
          discoveredAs,
          decodeState: "unavailable",
          reason:
            error instanceof Error ? error.message : "LB pair decode failed.",
        });
      }
    });
  }

  return {
    pools: pools.sort((left, right) =>
      left.address.localeCompare(right.address),
    ),
    minimumSlot,
    maximumSlot,
    missingAccounts,
  };
}

export async function countPoolPositions(
  rpc: ReadOnlySolanaRpc,
  poolAddress: string,
  minContextSlot: number,
  signal: AbortSignal,
): Promise<{ count: number; slot: number }> {
  assertCanonicalSolanaAddress(poolAddress, "Pool address");
  validateSlot(minContextSlot, "requested minimum context");
  const response = await rpc.getProgramAccounts<ContextResult<unknown[]>>(
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
  validateContext(response, "position probe");
  if (response.context.slot < minContextSlot) {
    throw new DlmmRpcDiscoveryError(
      "RPC position probe returned below its requested minimum context slot.",
    );
  }
  const accounts = validateProgramAccounts(
    response.value,
    "RPC position probe",
    "empty",
    MAX_POSITIONS_PER_POOL,
  );
  return { count: accounts.length, slot: response.context.slot };
}

async function scanPools(
  rpc: ReadOnlySolanaRpc,
  mint: string,
  orientation: "x" | "y",
  signal: AbortSignal,
): Promise<{
  slot: number;
  keys: Array<{ address: string; orientation: "x" | "y" }>;
}> {
  const response = await rpc.getProgramAccounts<ContextResult<unknown[]>>(
    DLMM_PROGRAM_ID,
    {
      commitment: "confirmed",
      encoding: "base64",
      withContext: true,
      dataSlice: { offset: 0, length: 0 },
      filters: [
        { memcmp: { offset: 0, bytes: LB_PAIR_DISCRIMINATOR } },
        {
          memcmp: {
            offset: orientation === "x" ? TOKEN_X_OFFSET : TOKEN_Y_OFFSET,
            bytes: mint,
          },
        },
      ],
    },
    signal,
  );
  validateContext(response, `token-${orientation} pool scan`);
  const accounts = validateProgramAccounts(
    response.value,
    `RPC token-${orientation} pool scan`,
    "empty",
    MAX_DLMM_POOLS_PER_TOKEN,
  );
  return {
    slot: response.context.slot,
    keys: accounts.map(({ pubkey }) => ({
      address: pubkey,
      orientation,
    })),
  };
}

function validateContext(
  value: ContextResult<unknown>,
  operation: string,
): void {
  if (
    !value ||
    !value.context ||
    !isSafeSlot(value.context.slot) ||
    !Array.isArray(value.value)
  ) {
    throw new DlmmRpcDiscoveryError(
      `RPC ${operation} response is missing context or values.`,
    );
  }
}

function validateSlot(slot: number, operation: string): void {
  if (!isSafeSlot(slot)) {
    throw new DlmmRpcDiscoveryError(`RPC ${operation} slot is malformed.`);
  }
}

function isSafeSlot(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
