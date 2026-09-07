import { describe, expect, it } from "vitest";
import {
  MAX_DECIMAL_COEFFICIENT_DIGITS,
  MAX_DECIMAL_TEXT_LENGTH,
  MAX_PROVIDER_FUTURE_SECONDS,
  U64_MAX,
  boundedDecimalNumber,
  boundedDecimalParts,
  isBoundedText,
  isSafeIntegerInRange,
  isSupportedSplAmount,
  isSupportedTimestampSeconds,
} from "./providerLimits";

describe("provider numeric and text limits", () => {
  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(isBoundedText("😀".repeat(256), 256)).toBe(true);
    expect(isBoundedText("😀".repeat(257), 256)).toBe(false);
    expect(isBoundedText("S".repeat(64), 64)).toBe(true);
    expect(isBoundedText("S".repeat(65), 64)).toBe(false);
  });

  it("accepts decimal boundaries and rejects N+1 and huge exponents", () => {
    const coefficient = "9".repeat(MAX_DECIMAL_COEFFICIENT_DIGITS);
    expect(boundedDecimalParts(`${coefficient}e-100`)).toMatchObject({
      digits: coefficient,
      exponent: -100,
    });
    expect(
      boundedDecimalParts("9".repeat(MAX_DECIMAL_COEFFICIENT_DIGITS + 1)),
    ).toBeUndefined();
    expect(boundedDecimalParts("1e101")).toBeUndefined();
    expect(boundedDecimalParts("1e-101")).toBeUndefined();
    const maxLength = `1${" ".repeat(MAX_DECIMAL_TEXT_LENGTH - 1)}`;
    expect(boundedDecimalParts(maxLength)).toBeDefined();
    expect(boundedDecimalParts(`${maxLength} `)).toBeUndefined();
    expect(
      boundedDecimalParts(`1.${"0".repeat(MAX_DECIMAL_TEXT_LENGTH)}`),
    ).toBeUndefined();
    expect(boundedDecimalNumber("1e100")).toBe(1e100);
    expect(boundedDecimalNumber("1e1000")).toBeUndefined();
    expect(boundedDecimalNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("accepts u64 amounts and safe integers only at their boundaries", () => {
    expect(isSupportedSplAmount(U64_MAX.toString())).toBe(true);
    expect(isSupportedSplAmount((U64_MAX + 1n).toString())).toBe(false);
    expect(isSupportedSplAmount("1".repeat(21))).toBe(false);
    expect(isSafeIntegerInRange(Number.MAX_SAFE_INTEGER, 0)).toBe(true);
    expect(isSafeIntegerInRange(Number.MAX_SAFE_INTEGER + 1, 0)).toBe(false);
  });

  it("caps provider timestamps at 24 hours beyond the current clock", () => {
    const now = 1_800_000_000_000;
    const boundary = now / 1_000 + MAX_PROVIDER_FUTURE_SECONDS;
    expect(isSupportedTimestampSeconds(boundary, now)).toBe(true);
    expect(isSupportedTimestampSeconds(boundary + 1, now)).toBe(false);
    expect(isSupportedTimestampSeconds(-1, now)).toBe(false);
  });
});
