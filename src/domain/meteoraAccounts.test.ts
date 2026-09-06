import { describe, expect, it } from "vitest";
import oracle from "../test/fixtures/lbPairOracle.json";
import positionOracle from "../test/fixtures/positionOracle.json";
import {
  decodeBinArrayAccount,
  decodeLbPairAccount,
  decodePositionV2Account,
  MeteoraAccountDecodeError,
} from "./meteoraAccounts";

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
});
