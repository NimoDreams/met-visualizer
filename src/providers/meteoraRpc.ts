import type { ReadOnlySolanaRpc } from "./solanaRpc";
import {
  decodeLbPairAccount,
  DLMM_PROGRAM_ID,
  LB_PAIR_DISCRIMINATOR,
  POSITION_V2_DISCRIMINATOR,
  type DecodedLbPair,
} from "../domain/meteoraAccounts";

const TOKEN_X_OFFSET = 88;
const TOKEN_Y_OFFSET = 120;
const POSITION_POOL_OFFSET = 8;
const ACCOUNT_BATCH_SIZE = 100;

type RpcAccount = {
  data: [string, "base64"];
  executable: boolean;
  lamports: number;
  owner: string;
};

type ProgramAccount = { pubkey: string; account: RpcAccount };
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

  const addresses = [...orientations.keys()].sort();
  const pools: Array<DiscoveredDlmmPool | UnavailableDlmmPool> = [];
  let minimumSlot = Math.min(asX.slot, asY.slot);
  let maximumSlot = Math.max(asX.slot, asY.slot);
  let missingAccounts = 0;

  for (let index = 0; index < addresses.length; index += ACCOUNT_BATCH_SIZE) {
    const batch = addresses.slice(index, index + ACCOUNT_BATCH_SIZE);
    const response = await rpc.getMultipleAccounts<
      ContextResult<Array<RpcAccount | null>>
    >(
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
      if (!account) {
        missingAccounts += 1;
        pools.push({
          address,
          discoveredAs,
          decodeState: "unavailable",
          reason: "Account disappeared before hydration.",
        });
        return;
      }
      if (account.owner !== DLMM_PROGRAM_ID || account.executable) {
        pools.push({
          address,
          discoveredAs,
          decodeState: "unavailable",
          reason: "Account owner or executable state does not match DLMM.",
        });
        return;
      }

      try {
        const decoded = decodeLbPairAccount(account.data[0]);
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
  const response = await rpc.getProgramAccounts<
    ContextResult<ProgramAccount[]>
  >(
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
  return { count: response.value.length, slot: response.context.slot };
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
  const response = await rpc.getProgramAccounts<
    ContextResult<ProgramAccount[]>
  >(
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
  return {
    slot: response.context.slot,
    keys: response.value.map(({ pubkey }) => ({
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
    !Number.isInteger(value.context.slot) ||
    !Array.isArray(value.value)
  ) {
    throw new DlmmRpcDiscoveryError(
      `RPC ${operation} response is missing context or values.`,
    );
  }
}
