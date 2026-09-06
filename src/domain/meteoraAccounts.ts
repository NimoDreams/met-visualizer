import { encodeBase58 } from "./base58";

export const DLMM_PROGRAM_ID = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
export const LB_PAIR_DISCRIMINATOR = "6XZoLajBWVJ";
export const POSITION_V2_DISCRIMINATOR = "LgkNAEYaVX3";

const LB_PAIR_DISCRIMINATOR_BYTES = Uint8Array.from([
  33, 11, 49, 98, 181, 101, 177, 13,
]);
const MINIMUM_LB_PAIR_BYTES = 216;

export type DecodedLbPair = {
  tokenXMint: string;
  tokenYMint: string;
  reserveX: string;
  reserveY: string;
  activeId: number;
  binStep: number;
  status: number;
};

export class MeteoraAccountDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeteoraAccountDecodeError";
  }
}

export function decodeLbPairAccount(encoded: string): DecodedLbPair {
  const data = decodeBase64(encoded);
  if (data.length < MINIMUM_LB_PAIR_BYTES) {
    throw new MeteoraAccountDecodeError(
      `LB pair account is too short (${data.length} bytes).`,
    );
  }
  if (LB_PAIR_DISCRIMINATOR_BYTES.some((byte, index) => data[index] !== byte)) {
    throw new MeteoraAccountDecodeError("LB pair discriminator mismatch.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    activeId: view.getInt32(76, true),
    binStep: view.getUint16(80, true),
    status: view.getUint8(82),
    tokenXMint: encodeBase58(data.subarray(88, 120)),
    tokenYMint: encodeBase58(data.subarray(120, 152)),
    reserveX: encodeBase58(data.subarray(152, 184)),
    reserveY: encodeBase58(data.subarray(184, 216)),
  };
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new MeteoraAccountDecodeError("LB pair data is not valid base64.");
  }
}
