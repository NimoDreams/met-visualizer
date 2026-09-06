import { afterEach, describe, expect, it, vi } from "vitest";
import { rankPositions } from "./positionWorker";

describe("position ranking worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("terminates worker computation when its generation is cancelled", async () => {
    const workers: FakeWorker[] = [];
    vi.stubGlobal(
      "Worker",
      class extends FakeWorker {
        constructor() {
          super();
          workers.push(this);
        }
      },
    );
    const controller = new AbortController();
    const promise = rankPositions(
      {
        poolAddress: "pool",
        positionAccounts: [],
        binArrayData: [],
        quoteSide: "y",
        quotePriceUsd: 1,
        quoteDecimals: 6,
        completePositionSet: true,
      },
      controller.signal,
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]?.terminated).toBe(true);
  });
});

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  postMessage(): void {}
  terminate(): void {
    this.terminated = true;
  }
}
