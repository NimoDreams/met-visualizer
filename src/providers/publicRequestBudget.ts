export type PublicRequestPriority =
  "user" | "selected" | "standard" | "speculative";

type BudgetOptions = {
  key?: string;
  priority?: PublicRequestPriority;
  signal?: AbortSignal;
};

type QueueItem = {
  key?: string;
  priority: number;
  sequence: number;
  signal?: AbortSignal;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  detachAbort?: () => void;
};

const priorityOrder: Record<PublicRequestPriority, number> = {
  user: 0,
  selected: 1,
  standard: 2,
  speculative: 3,
};

function abortError(): DOMException {
  return new DOMException("Request was cancelled.", "AbortError");
}

export class PublicRequestBudget {
  readonly limit: number;
  readonly windowMs: number;

  #dispatches: number[] = [];
  #inflight = new Map<string, Promise<unknown>>();
  #queue: QueueItem[] = [];
  #sequence = 0;
  #timer?: ReturnType<typeof setTimeout>;
  #blockedUntil = 0;

  constructor({ limit = 10, windowMs = 60_000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  schedule<T>(run: () => Promise<T>, options: BudgetOptions = {}): Promise<T> {
    if (options.signal?.aborted) {
      return Promise.reject(abortError());
    }

    if (options.key) {
      const existing = this.#inflight.get(options.key);
      if (existing) return existing as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      const item: QueueItem = {
        key: options.key,
        priority: priorityOrder[options.priority ?? "standard"],
        sequence: this.#sequence++,
        signal: options.signal,
        run,
        resolve: (value) => resolve(value as T),
        reject,
      };
      if (options.signal) {
        const onAbort = () => {
          const index = this.#queue.indexOf(item);
          if (index === -1) return;
          this.#queue.splice(index, 1);
          reject(abortError());
          this.#drain();
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        item.detachAbort = () =>
          options.signal?.removeEventListener("abort", onAbort);
      }
      this.#queue.push(item);
      queueMicrotask(() => this.#drain());
    });

    const key = options.key;
    if (key) {
      this.#inflight.set(key, promise);
      void promise.then(
        () => this.#inflight.delete(key),
        () => this.#inflight.delete(key),
      );
    }

    return promise;
  }

  defer(durationMs: number): void {
    this.#blockedUntil = Math.max(this.#blockedUntil, Date.now() + durationMs);
    this.#armTimer();
  }

  #drain(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    const now = Date.now();
    this.#dispatches = this.#dispatches.filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (now < this.#blockedUntil || this.#dispatches.length >= this.limit) {
      this.#armTimer();
      return;
    }

    this.#queue.sort(
      (left, right) =>
        left.priority - right.priority || left.sequence - right.sequence,
    );

    while (this.#queue.length > 0 && this.#dispatches.length < this.limit) {
      const item = this.#queue.shift();
      if (!item) break;
      item.detachAbort?.();
      if (item.signal?.aborted) {
        item.reject(abortError());
        continue;
      }

      this.#dispatches.push(now);
      void item.run().then(item.resolve, item.reject);
    }

    if (this.#queue.length > 0) this.#armTimer();
  }

  #armTimer(): void {
    if (this.#timer || this.#queue.length === 0) return;

    const now = Date.now();
    const oldestDispatch = this.#dispatches[0];
    const rateReadyAt =
      oldestDispatch === undefined ? now : oldestDispatch + this.windowMs;
    const readyAt = Math.max(this.#blockedUntil, rateReadyAt);
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined;
        this.#drain();
      },
      Math.max(0, readyAt - now),
    );
  }
}

export const sharedPublicRequestBudget = new PublicRequestBudget();
