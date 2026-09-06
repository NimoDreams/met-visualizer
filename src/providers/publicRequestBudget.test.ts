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
