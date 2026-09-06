import { describe, expect, it } from "vitest";
import { isSolanaAddress } from "./solanaAddress";

describe("isSolanaAddress", () => {
  it("accepts a 32-byte base58 token address", () => {
    expect(isSolanaAddress("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN")).toBe(
      true,
    );
  });

  it.each(["SOL", "0OIl", "JUP-USDC"])("rejects %s", (value) => {
    expect(isSolanaAddress(value)).toBe(false);
  });
});
