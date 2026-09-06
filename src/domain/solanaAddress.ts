const SOLANA_BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44 || !SOLANA_BASE58.test(value)) {
    return false;
  }

  let decoded = 0n;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  for (const character of value) {
    decoded = decoded * 58n + BigInt(alphabet.indexOf(character));
  }

  let byteLength = 0;
  for (let remaining = decoded; remaining > 0n; remaining >>= 8n) {
    byteLength += 1;
  }

  const leadingZeroBytes = value.match(/^1*/)?.[0].length ?? 0;
  return byteLength + leadingZeroBytes === 32;
}
