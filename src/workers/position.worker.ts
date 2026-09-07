/// <reference lib="webworker" />

import { prepareAndRankPositionAccounts } from "../domain/positionValuation";
import type {
  PositionWorkerRequest,
  PositionWorkerResponse,
} from "./positionWorker";

self.onmessage = (event: MessageEvent<PositionWorkerRequest>) => {
  try {
    const result = prepareAndRankPositionAccounts(event.data.input);
    self.postMessage({ generation: event.data.generation, result });
  } catch (error) {
    self.postMessage({
      generation: event.data.generation,
      error:
        error instanceof Error ? error.message : "Position ranking failed.",
    } satisfies PositionWorkerResponse);
  }
};
