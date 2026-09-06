import {
  prepareAndRankPositionAccounts,
  type PositionValueResult,
} from "../domain/positionValuation";

export type PositionWorkerInput = Parameters<
  typeof prepareAndRankPositionAccounts
>[0];
export type PositionWorkerRequest = {
  generation: number;
  input: PositionWorkerInput;
};
export type PositionWorkerResponse =
  | { generation: number; result: PositionValueResult }
  | { generation: number; error: string };

let nextGeneration = 0;

export function rankPositions(
  input: PositionWorkerInput,
  signal: AbortSignal,
): Promise<PositionValueResult> {
  const generation = ++nextGeneration;
  if (typeof Worker === "undefined") {
    return new Promise((resolve, reject) => {
      queueMicrotask(() => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        try {
          resolve(prepareAndRankPositionAccounts(input));
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Position ranking failed."),
          );
        }
      });
    });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./position.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    const abort = () => {
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<PositionWorkerResponse>) => {
      if (event.data.generation !== generation || signal.aborted) return;
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if ("error" in event.data) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      reject(new Error("Position ranking worker failed."));
    };
    worker.postMessage({ generation, input } satisfies PositionWorkerRequest);
  });
}
