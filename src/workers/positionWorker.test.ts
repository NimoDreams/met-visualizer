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
        activeBinId: 0,
        quoteSide: "y",
        quotePriceUsdExact: "1",
        quoteDecimals: 6,
        completePositionSet: true,
      },
      controller.signal,
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]?.terminated).toBe(true);
  });

  it("rejects a pre-aborted request without constructing a worker", async () => {
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
    controller.abort();
    await expect(
      rankPositions(
        {
          poolAddress: "pool",
          positionAccounts: [],
          binArrayData: [],
          activeBinId: 0,
          quoteSide: "y",
          quotePriceUsdExact: "1",
          quoteDecimals: 6,
          completePositionSet: true,
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(workers).toHaveLength(0);
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
