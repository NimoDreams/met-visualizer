const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);

  let encoded = "";
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = ALPHABET[remainder] + encoded;
    value /= 58n;
  }

  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros += 1;
  }
  return "1".repeat(leadingZeros) + encoded;
}

export function decodeBase58(value: string): Uint8Array {
  let decoded = 0n;
  for (const character of value) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base58 value.");
    decoded = decoded * 58n + BigInt(index);
  }

  const output: number[] = [];
  while (decoded > 0n) {
    output.push(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  output.reverse();
  const leadingZeros = value.match(/^1*/)?.[0].length ?? 0;
  return Uint8Array.from([
    ...new Array<number>(leadingZeros).fill(0),
    ...output,
  ]);
}
