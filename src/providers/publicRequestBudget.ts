import { MAX_RETRY_AFTER_MS, safeTimerDelay } from "./http";

export const MAX_PUBLIC_QUEUE_ITEMS = 64;

export type PublicRequestPriority =
  "user" | "selected" | "standard" | "speculative";

type BudgetOptions = {
  key?: string;
  priority?: PublicRequestPriority;
  signal?: AbortSignal;
};

type Consumer = {
  settled: boolean;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  detachAbort?: () => void;
};

type QueueItem = {
  key?: string;
  priority: number;
  sequence: number;
  controller: AbortController;
  consumers: Set<Consumer>;
  run: (signal: AbortSignal) => Promise<unknown>;
  started: boolean;
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
  readonly queueLimit: number;

  #dispatches: number[] = [];
  #inflight = new Map<string, QueueItem>();
  #queue: QueueItem[] = [];
  #sequence = 0;
  #timer?: ReturnType<typeof setTimeout>;
  #blockedUntil = 0;

  constructor({
    limit = 10,
    windowMs = 60_000,
    queueLimit = MAX_PUBLIC_QUEUE_ITEMS,
  } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.queueLimit = Math.min(
      MAX_PUBLIC_QUEUE_ITEMS,
      Math.max(0, Number.isFinite(queueLimit) ? Math.floor(queueLimit) : 0),
    );
  }

  schedule<T>(
    run: (signal: AbortSignal) => Promise<T>,
    options: BudgetOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted) {
      return Promise.reject(abortError());
    }

    let item = options.key ? this.#inflight.get(options.key) : undefined;
    if (!item) {
      if (this.#queue.length >= this.queueLimit) {
        return Promise.reject(
          new Error(
            "Public request queue reached its safe limit. Try again shortly.",
          ),
        );
      }
      item = {
        key: options.key,
        priority: priorityOrder[options.priority ?? "standard"],
        sequence: this.#sequence++,
        controller: new AbortController(),
        consumers: new Set(),
        run,
        started: false,
      };
      if (options.key) this.#inflight.set(options.key, item);
      this.#queue.push(item);
      queueMicrotask(() => this.#drain());
    }

    return this.#attachConsumer<T>(item, options.signal);
  }

  defer(durationMs: number): void {
    const boundedDuration = Math.min(
      Math.max(
        0,
        Number.isFinite(durationMs) ? durationMs : MAX_RETRY_AFTER_MS,
      ),
      MAX_RETRY_AFTER_MS,
    );
    this.#blockedUntil = Math.max(
      this.#blockedUntil,
      Date.now() + boundedDuration,
    );
    this.#armTimer();
  }

  #attachConsumer<T>(
    item: QueueItem,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const consumer: Consumer = {
        settled: false,
        resolve: (value) => resolve(value as T),
        reject,
      };
      item.consumers.add(consumer);

      if (signal) {
        const onAbort = () => {
          if (consumer.settled) return;
          consumer.settled = true;
          consumer.detachAbort?.();
          item.consumers.delete(consumer);
          reject(abortError());
          if (item.consumers.size === 0) this.#cancel(item);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        consumer.detachAbort = () =>
          signal.removeEventListener("abort", onAbort);
        if (signal.aborted) onAbort();
      }
    });
  }

  #cancel(item: QueueItem): void {
    if (!item.started) {
      const index = this.#queue.indexOf(item);
      if (index !== -1) this.#queue.splice(index, 1);
    }
    item.controller.abort();
    this.#forget(item);
    this.#drain();
  }

  #settle(item: QueueItem, succeeded: boolean, value: unknown): void {
    this.#forget(item);
    for (const consumer of item.consumers) {
      if (consumer.settled) continue;
      consumer.settled = true;
      consumer.detachAbort?.();
      if (succeeded) consumer.resolve(value);
      else consumer.reject(value);
    }
    item.consumers.clear();
  }

  #forget(item: QueueItem): void {
    if (item.key && this.#inflight.get(item.key) === item) {
      this.#inflight.delete(item.key);
    }
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
      if (item.consumers.size === 0) {
        this.#forget(item);
        continue;
      }

      item.started = true;
      this.#dispatches.push(now);
      try {
        void item.run(item.controller.signal).then(
          (value) => this.#settle(item, true, value),
          (error: unknown) => this.#settle(item, false, error),
        );
      } catch (error) {
        this.#settle(item, false, error);
      }
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
      safeTimerDelay(readyAt - now),
    );
  }
}

export const sharedPublicRequestBudget = new PublicRequestBudget();
