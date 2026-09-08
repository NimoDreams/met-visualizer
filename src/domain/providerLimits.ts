export const MAX_PUBLIC_CANDIDATES = 100;
export const MAX_PUBLIC_CANDLES = 1_000;
export const MAX_PUBLIC_QUOTE_MINTS = 100;
export const MAX_PROVIDER_NAME_CODE_POINTS = 256;
export const MAX_PROVIDER_IDENTIFIER_CODE_POINTS = 64;
export const MAX_DECIMAL_TEXT_LENGTH = 128;
export const MAX_DECIMAL_COEFFICIENT_DIGITS = 96;
export const MAX_DECIMAL_EXPONENT = 100;
export const MAX_SPL_DECIMALS = 255;
export const MAX_SPL_AMOUNT_DIGITS = 20;
export const MAX_PROVIDER_PAGINATION_TOTAL = 100_000;
export const MAX_PROVIDER_FUTURE_SECONDS = 24 * 60 * 60;
export const U64_MAX = 18_446_744_073_709_551_615n;

export type BoundedDecimalParts = {
  digits: string;
  fractionalDigits: number;
  exponent: number;
};

export function isBoundedText(
  value: unknown,
  maxCodePoints: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    [...value].length <= maxCodePoints
  );
}

export function boundedDecimalParts(
  value: string,
): BoundedDecimalParts | undefined {
  if (value.length > MAX_DECIMAL_TEXT_LENGTH) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(trimmed);
  if (!match) return undefined;
  const fractional = match[2] ?? "";
  const digits = `${match[1]}${fractional}`;
  if (digits.length > MAX_DECIMAL_COEFFICIENT_DIGITS) return undefined;
  const exponent = Number(match[3] ?? 0);
  if (
    !Number.isSafeInteger(exponent) ||
    Math.abs(exponent) > MAX_DECIMAL_EXPONENT
  )
    return undefined;
  return { digits, fractionalDigits: fractional.length, exponent };
}

export function boundedDecimalNumber(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) && boundedDecimalParts(value.toString())
      ? value
      : undefined;
  if (typeof value !== "string" || !boundedDecimalParts(value))
    return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isSafeIntegerInRange(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  const parsed = boundedDecimalNumber(value);
  return (
    parsed !== undefined &&
    Number.isSafeInteger(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
  );
}

export function isSupportedSplAmount(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SPL_AMOUNT_DIGITS ||
    !/^\d+$/.test(value)
  )
    return false;
  return BigInt(value) <= U64_MAX;
}

export function isSupportedTimestampSeconds(
  value: number,
  now = Date.now(),
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Math.floor(now / 1_000) + MAX_PROVIDER_FUTURE_SECONDS
  );
}
