import { describe, expect, it } from "vitest";
import oracle from "../test/fixtures/lbPairOracle.json";
import {
  decodeLbPairAccount,
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
