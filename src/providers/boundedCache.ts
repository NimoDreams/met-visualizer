export const MAX_PROVIDER_CACHE_ENTRIES = 256;

type CacheEntry<T> = { expiresAt: number; value: T };

export class BoundedTtlCache<T> {
  readonly #entries = new Map<string, CacheEntry<T>>();
  readonly #maxEntries: number;

  constructor(maxEntries = MAX_PROVIDER_CACHE_ENTRIES) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error("Provider cache limit must be a positive integer.");
    }
    this.#maxEntries = Math.min(maxEntries, MAX_PROVIDER_CACHE_ENTRIES);
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: string, now = Date.now()): T | undefined {
    this.#evictExpired(now);
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, expiresAt: number, now = Date.now()): void {
    this.#evictExpired(now);
    this.#entries.delete(key);
    if (expiresAt <= now) return;
    this.#entries.set(key, { value, expiresAt });
    while (this.#entries.size > this.#maxEntries) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
  }

  #evictExpired(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(key);
    }
  }
}
