import { describe, expect, it, vi } from "vitest";
import { PublicRequestBudget } from "./publicRequestBudget";

describe("PublicRequestBudget", () => {
  it("dispatches queued work by priority and preserves order within a priority", async () => {
    const budget = new PublicRequestBudget({ limit: 10, windowMs: 60_000 });
    const order: string[] = [];

    const speculative = budget.schedule(
      () => {
        order.push("speculative");
        return Promise.resolve();
      },
      { priority: "speculative" },
    );
    const firstUser = budget.schedule(
      () => {
        order.push("first-user");
        return Promise.resolve();
      },
      { priority: "user" },
    );
    const secondUser = budget.schedule(
      () => {
        order.push("second-user");
        return Promise.resolve();
      },
      { priority: "user" },
    );

    await Promise.all([speculative, firstUser, secondUser]);
    expect(order).toEqual(["first-user", "second-user", "speculative"]);
  });

  it("deduplicates concurrent requests with the same key", async () => {
    const budget = new PublicRequestBudget();
    const run = vi.fn(() => Promise.resolve("shared result"));

    const first = budget.schedule(run, { key: "quotes:mint" });
    const second = budget.schedule(run, { key: "quotes:mint" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      "shared result",
      "shared result",
    ]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lets an old consumer abort without cancelling a newer same-key consumer", async () => {
    const budget = new PublicRequestBudget();
    const oldController = new AbortController();
    const newController = new AbortController();
    const pending = deferred<string>();
    let sharedSignal: AbortSignal | undefined;
    const run = vi.fn((signal: AbortSignal) => {
      sharedSignal = signal;
      return pending.promise;
    });

    const oldRequest = budget.schedule(run, {
      key: "token:same-ca",
      signal: oldController.signal,
    });
    const newRequest = budget.schedule(run, {
      key: "token:same-ca",
      signal: newController.signal,
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    oldController.abort();
    await expect(oldRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal?.aborted).toBe(false);

    pending.resolve("new session result");
    await expect(newRequest).resolves.toBe("new session result");
  });

  it("lets a newer consumer abort without cancelling the older live consumer", async () => {
    const budget = new PublicRequestBudget();
    const oldController = new AbortController();
    const newController = new AbortController();
    const pending = deferred<string>();
    let sharedSignal: AbortSignal | undefined;
    const run = vi.fn((signal: AbortSignal) => {
      sharedSignal = signal;
      return pending.promise;
    });

    const oldRequest = budget.schedule(run, {
      key: "pools:same-ca",
      signal: oldController.signal,
    });
    const newRequest = budget.schedule(run, {
      key: "pools:same-ca",
      signal: newController.signal,
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));

    newController.abort();
    await expect(newRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal?.aborted).toBe(false);

    pending.resolve("old session result");
    await expect(oldRequest).resolves.toBe("old session result");
  });

  it("cancels orphaned shared work and permits a clean same-key retry", async () => {
    const budget = new PublicRequestBudget();
    const firstController = new AbortController();
    const secondController = new AbortController();
    let sharedSignal: AbortSignal | undefined;
    const orphanedRun = vi.fn(
      (signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          sharedSignal = signal;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    );

    const first = budget.schedule(orphanedRun, {
      key: "candles:same-ca",
      signal: firstController.signal,
    });
    const second = budget.schedule(orphanedRun, {
      key: "candles:same-ca",
      signal: secondController.signal,
    });
    await vi.waitFor(() => expect(orphanedRun).toHaveBeenCalledTimes(1));

    firstController.abort();
    secondController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal?.aborted).toBe(true);

    const retryRun = vi.fn(() => Promise.resolve("fresh result"));
    await expect(
      budget.schedule(retryRun, { key: "candles:same-ca" }),
    ).resolves.toBe("fresh result");
    expect(retryRun).toHaveBeenCalledTimes(1);
  });

  it("holds excess requests until the rolling window is available", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const budget = new PublicRequestBudget({ limit: 2, windowMs: 1_000 });
    const run = vi.fn(() => Promise.resolve(undefined));

    const requests = [
      budget.schedule(run),
      budget.schedule(run),
      budget.schedule(run),
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(3);
    await Promise.all(requests);
    vi.useRealTimers();
  });

  it("rejects an aborted queued request without dispatching it", async () => {
    const budget = new PublicRequestBudget({ limit: 0, windowMs: 60_000 });
    const controller = new AbortController();
    const run = vi.fn(() => Promise.resolve(undefined));

    const request = budget.schedule(run, { signal: controller.signal });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolve) throw new Error("deferred promise was not initialized");
      resolve(value);
    },
  };
}
