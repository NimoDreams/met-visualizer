const SOLANA_BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function isSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44 || !SOLANA_BASE58.test(value)) {
    return false;
  }

  let decoded = 0n;
  for (const character of value) {
    decoded = decoded * 58n + BigInt(BASE58_ALPHABET.indexOf(character));
  }

  let byteLength = 0;
  for (let remaining = decoded; remaining > 0n; remaining >>= 8n) {
    byteLength += 1;
  }

  const leadingZeroBytes = value.match(/^1*/)?.[0].length ?? 0;
  return byteLength + leadingZeroBytes === 32;
}

export function assertCanonicalSolanaAddress(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !isSolanaAddress(value)) {
    throw new Error(`${label} is not a canonical 32-byte Solana address.`);
  }

  let decoded = 0n;
  for (const character of value) {
    decoded = decoded * 58n + BigInt(BASE58_ALPHABET.indexOf(character));
  }

  let canonical = "";
  while (decoded > 0n) {
    canonical = BASE58_ALPHABET[Number(decoded % 58n)] + canonical;
    decoded /= 58n;
  }
  canonical = "1".repeat(value.match(/^1*/)?.[0].length ?? 0) + canonical;
  if (canonical !== value) {
    throw new Error(`${label} is not a canonical 32-byte Solana address.`);
  }
}
