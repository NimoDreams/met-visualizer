import {
  DLMM_PROGRAM_ID,
  type MeteoraAccountKind,
  validateMeteoraAccountBase64,
} from "../domain/meteoraAccounts";
import { assertCanonicalSolanaAddress } from "../domain/solanaAddress";

export const MAX_DLMM_POOLS_PER_TOKEN = 2_000;
export const MAX_POSITIONS_PER_POOL = 5_000;
export const MAX_BIN_ARRAYS_PER_POOL = 512;

export type ValidatedRpcAccount = {
  data: [string, "base64"];
  executable: false;
  owner: typeof DLMM_PROGRAM_ID;
};

export type ValidatedProgramAccount = {
  pubkey: string;
  account: ValidatedRpcAccount;
  decodedBytes: number;
};

export function validateDlmmAccountEnvelope(
  value: unknown,
  label: string,
  kind: MeteoraAccountKind,
): { account: ValidatedRpcAccount; decodedBytes: number } {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} account response is malformed.`);
  }
  const candidate = value as Record<string, unknown>;
  const tuple = candidate.data;
  if (
    !Array.isArray(tuple) ||
    tuple.length !== 2 ||
    typeof tuple[0] !== "string" ||
    tuple[1] !== "base64"
  ) {
    throw new Error(`${label} account data encoding is malformed.`);
  }
  if (candidate.owner !== DLMM_PROGRAM_ID || candidate.executable !== false) {
    throw new Error(`${label} owner or executable state does not match DLMM.`);
  }

  return {
    account: {
      data: [tuple[0], "base64"],
      executable: false,
      owner: DLMM_PROGRAM_ID,
    },
    decodedBytes: validateMeteoraAccountBase64(tuple[0], kind),
  };
}

export function validateProgramAccounts(
  values: readonly unknown[],
  label: string,
  kind: MeteoraAccountKind,
  maximum: number,
): ValidatedProgramAccount[] {
  if (values.length > maximum) {
    throw new Error(`${label} exceeds the supported account limit.`);
  }

  const unique = new Map<string, ValidatedProgramAccount>();
  for (const value of values) {
    if (!value || typeof value !== "object") {
      throw new Error(`${label} entry is malformed.`);
    }
    const candidate = value as Record<string, unknown>;
    assertCanonicalSolanaAddress(candidate.pubkey, `${label} address`);
    const { account, decodedBytes } = validateDlmmAccountEnvelope(
      candidate.account,
      label,
      kind,
    );
    unique.set(candidate.pubkey, {
      pubkey: candidate.pubkey,
      account,
      decodedBytes,
    });
  }
  return [...unique.values()];
}
