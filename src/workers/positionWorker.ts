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
  if (signal.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));
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
    let settled = false;
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<PositionWorkerResponse>) => {
      if (settled) return;
      if (event.data.generation !== generation) {
        settled = true;
        cleanup();
        reject(
          new Error("Position ranking worker returned a stale generation."),
        );
        return;
      }
      if (signal.aborted) {
        abort();
        return;
      }
      settled = true;
      cleanup();
      if ("error" in event.data) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Position ranking worker failed."));
    };
    worker.postMessage({ generation, input } satisfies PositionWorkerRequest);
  });
}
