import { afterEach, describe, expect, it, vi } from "vitest";
import oracle from "../test/fixtures/lbPairOracle.json";
import positionOracle from "../test/fixtures/positionOracle.json";
import {
  decodeBinArrayAccount,
  decodeLbPairAccount,
  decodePositionV2Account,
  MeteoraAccountDecodeError,
  validateMeteoraAccountBase64,
} from "./meteoraAccounts";

afterEach(() => vi.restoreAllMocks());

describe("decodeLbPairAccount", () => {
  it("matches the pinned official Meteora SDK and IDL oracle", () => {
    expect(decodeLbPairAccount(oracle.data)).toEqual(oracle.expected);
    expect(oracle.oracle).toMatchObject({
      package: "@meteora-ag/dlmm",
      version: "1.9.14",
      commit: "576919e3e4368e542c402f000b4264724f7f23ec",
    });
  });

  it("fails closed for truncated data or a discriminator mismatch", () => {
    expect(() => decodeLbPairAccount(btoa("short"))).toThrow(
      MeteoraAccountDecodeError,
    );
    const bytes = Uint8Array.from(atob(oracle.data), (value) =>
      value.charCodeAt(0),
    );
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const invalid = btoa(String.fromCharCode(...bytes));
    expect(() => decodeLbPairAccount(invalid)).toThrow(/discriminator/i);
  });
});

describe("PositionV2 and BinArray decoders", () => {
  it("matches the pinned SDK/IDL oracle including dynamic extension bins", () => {
    const decoded = decodePositionV2Account(
      positionOracle.positionData,
      positionOracle.pool,
    );
    expect({
      lbPair: decoded.lbPair,
      owner: decoded.owner,
      lowerBinId: decoded.lowerBinId,
      upperBinId: decoded.upperBinId,
      liquidityShares: decoded.liquidityShares.map(String),
    }).toEqual({
      lbPair: positionOracle.pool,
      owner: positionOracle.owner,
      lowerBinId: positionOracle.expected.lowerBinId,
      upperBinId: positionOracle.expected.upperBinId,
      liquidityShares: positionOracle.expected.liquidityShares,
    });
    expect(decoded.liquidityShares).toHaveLength(72);
    expect(decoded.liquidityShares[70]).toBe(10n);
    expect(positionOracle.oracle).toMatchObject({
      package: "@meteora-ag/dlmm",
      version: "1.9.14",
      commit: "576919e3e4368e542c402f000b4264724f7f23ec",
    });
  });

  it("matches the pinned BinArray oracle", () => {
    const decoded = positionOracle.binArrayData.map((data) =>
      decodeBinArrayAccount(data, positionOracle.pool),
    );
    expect(decoded.map(({ index }) => String(index))).toEqual(
      positionOracle.expected.binArrayIndexes,
    );
    const bins = decoded.flatMap(({ bins }) => bins);
    for (const expected of positionOracle.expected.selectedBins) {
      expect(bins.find(({ binId }) => binId === expected.binId)).toMatchObject({
        amountX: BigInt(expected.amountX),
        amountY: BigInt(expected.amountY),
        priceQ64: BigInt(expected.priceQ64),
        liquiditySupply: BigInt(expected.liquiditySupply),
      });
    }
  });

  it("fails closed instead of silently omitting extension bins", () => {
    const bytes = Uint8Array.from(atob(positionOracle.positionData), (value) =>
      value.charCodeAt(0),
    );
    const truncated = bytes.subarray(0, bytes.length - 112);
    expect(() =>
      decodePositionV2Account(
        btoa(String.fromCharCode(...truncated)),
        positionOracle.pool,
      ),
    ).toThrow(/extension length mismatch/i);
  });

  it("enforces every decoded account envelope at its N and N+1 boundary", () => {
    expect(validateMeteoraAccountBase64(encodedBytes(216), "LB pair")).toBe(
      216,
    );
    expect(validateMeteoraAccountBase64(encodedBytes(4_096), "LB pair")).toBe(
      4_096,
    );
    expect(() =>
      validateMeteoraAccountBase64(encodedBytes(215), "LB pair"),
    ).toThrow(/unsupported decoded size/i);
    expect(() =>
      validateMeteoraAccountBase64(encodedBytes(4_097), "LB pair"),
    ).toThrow(/size limit|unsupported decoded size/i);

    expect(
      validateMeteoraAccountBase64(encodedBytes(8_120), "PositionV2"),
    ).toBe(8_120);
    const maximumPosition = encodedBytes(157_080);
    expect(maximumPosition).toHaveLength(209_440);
    expect(validateMeteoraAccountBase64(maximumPosition, "PositionV2")).toBe(
      157_080,
    );
    expect(() =>
      validateMeteoraAccountBase64(encodedBytes(8_119), "PositionV2"),
    ).toThrow(/unsupported decoded size/i);
    expect(() =>
      validateMeteoraAccountBase64(encodedBytes(157_081), "PositionV2"),
    ).toThrow(/size limit/i);
    expect(() =>
      validateMeteoraAccountBase64("A".repeat(209_441), "PositionV2"),
    ).toThrow(/size limit/i);

    const exactBinArray = encodedBytes(10_136);
    expect(exactBinArray).toHaveLength(13_516);
    expect(validateMeteoraAccountBase64(exactBinArray, "BinArray")).toBe(
      10_136,
    );
    expect(() =>
      validateMeteoraAccountBase64(encodedBytes(10_135), "BinArray"),
    ).toThrow(/unsupported decoded size/i);
    expect(() =>
      validateMeteoraAccountBase64(encodedBytes(10_137), "BinArray"),
    ).toThrow(/size limit|unsupported decoded size/i);
    expect(() =>
      validateMeteoraAccountBase64("A".repeat(13_517), "BinArray"),
    ).toThrow(/size limit/i);
  });

  it("rejects malformed, noncanonical, and oversized base64 before atob", () => {
    const atobSpy = vi.spyOn(globalThis, "atob");
    for (const invalid of [
      "AAAA\n",
      "AAA_",
      "A===",
      "AB==",
      "AAB=",
      "A".repeat(209_444),
    ]) {
      expect(() => decodePositionV2Account(invalid)).toThrow(
        MeteoraAccountDecodeError,
      );
    }
    expect(atobSpy).not.toHaveBeenCalled();
  });

  it("accepts PositionV2 widths 1 and 1,400 and rejects invalid ranges", () => {
    expect(
      decodePositionV2Account(positionWithWidth(1)).liquidityShares,
    ).toHaveLength(1);
    expect(
      decodePositionV2Account(positionWithWidth(1_400)).liquidityShares,
    ).toHaveLength(1_400);
    expect(() => decodePositionV2Account(positionWithWidth(0))).toThrow(
      /bin range is invalid/i,
    );
    expect(() =>
      decodePositionV2Account(positionWithWidth(1_401, 8_120)),
    ).toThrow(/bin range is invalid/i);
  });

  it("keeps every derived BinArray bin identifier within signed int32", () => {
    const maximumIndex = (2_147_483_647n - 69n) / 70n;
    const minimumIndex = -(2_147_483_648n / 70n);
    expect(
      decodeBinArrayAccount(binArrayWithIndex(maximumIndex)).bins.at(-1)?.binId,
    ).toBeLessThanOrEqual(2_147_483_647);
    expect(
      decodeBinArrayAccount(binArrayWithIndex(minimumIndex)).bins[0]?.binId,
    ).toBeGreaterThanOrEqual(-2_147_483_648);
    expect(() =>
      decodeBinArrayAccount(binArrayWithIndex(maximumIndex + 1n)),
    ).toThrow(/signed-int32/i);
    expect(() =>
      decodeBinArrayAccount(binArrayWithIndex(minimumIndex - 1n)),
    ).toThrow(/signed-int32/i);
  });
});

function encodedBytes(length: number): string {
  return Buffer.alloc(length).toString("base64");
}

function positionWithWidth(width: number, byteLength?: number): string {
  const safeWidth = Math.max(1, width);
  const length = byteLength ?? 8_120 + Math.max(0, safeWidth - 70) * 112;
  const bytes = Buffer.alloc(length);
  bytes.set([117, 176, 212, 199, 245, 180, 133, 182]);
  bytes.writeInt32LE(100, 7_912);
  bytes.writeInt32LE(width === 0 ? 99 : 100 + width - 1, 7_916);
  return bytes.toString("base64");
}

function binArrayWithIndex(index: bigint): string {
  const bytes = Buffer.alloc(10_136);
  bytes.set([92, 142, 92, 220, 5, 148, 70, 181]);
  bytes.writeBigInt64LE(index, 8);
  return bytes.toString("base64");
}
