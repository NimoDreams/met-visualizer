import { encodeBase58 } from "./base58";

export const DLMM_PROGRAM_ID = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
export const LB_PAIR_DISCRIMINATOR = "6XZoLajBWVJ";
export const POSITION_V2_DISCRIMINATOR = "LgkNAEYaVX3";
export const BIN_ARRAY_DISCRIMINATOR = "GUunkrC2gRJ";

const LB_PAIR_DISCRIMINATOR_BYTES = Uint8Array.from([
  33, 11, 49, 98, 181, 101, 177, 13,
]);
const MINIMUM_LB_PAIR_BYTES = 216;
const POSITION_V2_DISCRIMINATOR_BYTES = Uint8Array.from([
  117, 176, 212, 199, 245, 180, 133, 182,
]);
const BIN_ARRAY_DISCRIMINATOR_BYTES = Uint8Array.from([
  92, 142, 92, 220, 5, 148, 70, 181,
]);
const POSITION_V2_BASE_BYTES = 8120;
const POSITION_V2_BASE_BINS = 70;
const POSITION_BIN_EXTENSION_BYTES = 112;
const BIN_ARRAY_BYTES = 10_136;
const BIN_ARRAY_SIZE = 70;
const BIN_BYTES = 144;

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

export type DecodedPositionV2 = {
  lbPair: string;
  owner: string;
  lowerBinId: number;
  upperBinId: number;
  liquidityShares: bigint[];
};

export type DecodedBin = {
  binId: number;
  amountX: bigint;
  amountY: bigint;
  priceQ64: bigint;
  liquiditySupply: bigint;
};

export type DecodedBinArray = {
  lbPair: string;
  index: bigint;
  bins: DecodedBin[];
};

export function decodeLbPairAccount(encoded: string): DecodedLbPair {
  const data = decodeBase64(encoded, "LB pair");
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

export function decodePositionV2Account(
  encoded: string,
  expectedPool?: string,
): DecodedPositionV2 {
  const data = decodeBase64(encoded, "PositionV2");
  if (data.length < POSITION_V2_BASE_BYTES) {
    throw new MeteoraAccountDecodeError(
      `PositionV2 account is too short (${data.length} bytes).`,
    );
  }
  assertDiscriminator(data, POSITION_V2_DISCRIMINATOR_BYTES, "PositionV2");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lowerBinId = view.getInt32(7912, true);
  const upperBinId = view.getInt32(7916, true);
  const width = upperBinId - lowerBinId + 1;
  if (width < 1 || width > 1_400) {
    throw new MeteoraAccountDecodeError(
      `PositionV2 bin range is invalid (${lowerBinId}–${upperBinId}).`,
    );
  }
  const extensionBins = Math.max(0, width - POSITION_V2_BASE_BINS);
  const expectedBytes =
    POSITION_V2_BASE_BYTES + extensionBins * POSITION_BIN_EXTENSION_BYTES;
  if (data.length !== expectedBytes) {
    throw new MeteoraAccountDecodeError(
      `PositionV2 extension length mismatch (${data.length}; expected ${expectedBytes}).`,
    );
  }
  const lbPair = encodeBase58(data.subarray(8, 40));
  if (expectedPool && lbPair !== expectedPool) {
    throw new MeteoraAccountDecodeError(
      "PositionV2 pool does not match its RPC filter.",
    );
  }
  const liquidityShares = Array.from({ length: width }, (_, index) => {
    const offset =
      index < POSITION_V2_BASE_BINS
        ? 72 + index * 16
        : POSITION_V2_BASE_BYTES +
          (index - POSITION_V2_BASE_BINS) * POSITION_BIN_EXTENSION_BYTES;
    return readU128(view, offset);
  });
  return {
    lbPair,
    owner: encodeBase58(data.subarray(40, 72)),
    lowerBinId,
    upperBinId,
    liquidityShares,
  };
}

export function decodeBinArrayAccount(
  encoded: string,
  expectedPool?: string,
): DecodedBinArray {
  const data = decodeBase64(encoded, "BinArray");
  if (data.length !== BIN_ARRAY_BYTES) {
    throw new MeteoraAccountDecodeError(
      `BinArray length mismatch (${data.length}; expected ${BIN_ARRAY_BYTES}).`,
    );
  }
  assertDiscriminator(data, BIN_ARRAY_DISCRIMINATOR_BYTES, "BinArray");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const index = view.getBigInt64(8, true);
  const lbPair = encodeBase58(data.subarray(24, 56));
  if (expectedPool && lbPair !== expectedPool) {
    throw new MeteoraAccountDecodeError(
      "BinArray pool does not match its RPC filter.",
    );
  }
  const firstBinId = Number(index) * BIN_ARRAY_SIZE;
  const bins = Array.from({ length: BIN_ARRAY_SIZE }, (_, binIndex) => {
    const offset = 56 + binIndex * BIN_BYTES;
    return {
      binId: firstBinId + binIndex,
      amountX: view.getBigUint64(offset, true),
      amountY: view.getBigUint64(offset + 8, true),
      priceQ64: readU128(view, offset + 16),
      liquiditySupply: readU128(view, offset + 32),
    };
  });
  return { lbPair, index, bins };
}

function readU128(view: DataView, offset: number): bigint {
  return (
    view.getBigUint64(offset, true) |
    (view.getBigUint64(offset + 8, true) << 64n)
  );
}

function assertDiscriminator(
  data: Uint8Array,
  discriminator: Uint8Array,
  label: string,
): void {
  if (discriminator.some((byte, index) => data[index] !== byte)) {
    throw new MeteoraAccountDecodeError(`${label} discriminator mismatch.`);
  }
}

function decodeBase64(value: string, label: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new MeteoraAccountDecodeError(`${label} data is not valid base64.`);
  }
}
