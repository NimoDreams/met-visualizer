import { describe, expect, it } from "vitest";
import { BoundedTtlCache, MAX_PROVIDER_CACHE_ENTRIES } from "./boundedCache";

describe("BoundedTtlCache", () => {
  it("holds 256 entries and evicts the least recently used at N+1", () => {
    const cache = new BoundedTtlCache<number>();
    for (let index = 0; index < MAX_PROVIDER_CACHE_ENTRIES; index += 1) {
      cache.set(`key-${index}`, index, 10_000, 0);
    }
    expect(cache.size).toBe(MAX_PROVIDER_CACHE_ENTRIES);

    expect(cache.get("key-0", 0)).toBe(0);
    cache.set("key-256", 256, 10_000, 0);

    expect(cache.size).toBe(MAX_PROVIDER_CACHE_ENTRIES);
    expect(cache.get("key-0", 0)).toBe(0);
    expect(cache.get("key-1", 0)).toBeUndefined();
  });

  it("evicts every expired entry before inserting a replacement", () => {
    const cache = new BoundedTtlCache<number>();
    cache.set("expired-a", 1, 10, 0);
    cache.set("expired-b", 2, 20, 0);

    cache.set("current", 3, 100, 20);

    expect(cache.size).toBe(1);
    expect(cache.get("current", 20)).toBe(3);
  });

  it("cannot be configured above the provider-wide ceiling", () => {
    const cache = new BoundedTtlCache<number>(MAX_PROVIDER_CACHE_ENTRIES + 1);
    for (let index = 0; index <= MAX_PROVIDER_CACHE_ENTRIES; index += 1) {
      cache.set(`key-${index}`, index, 10_000, 0);
    }
    expect(cache.size).toBe(MAX_PROVIDER_CACHE_ENTRIES);
    expect(cache.get("key-0", 0)).toBeUndefined();
  });
});
