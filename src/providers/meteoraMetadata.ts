import { requestJson } from "./http";

const METEORA_DATA_BASE = "https://dlmm.datapi.meteora.ag";

export interface MeteoraMetadataProvider {
  readPools(query: URLSearchParams, signal?: AbortSignal): Promise<unknown>;
}

export class PublicMeteoraMetadataProvider implements MeteoraMetadataProvider {
  readPools(query: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
    return requestJson(`${METEORA_DATA_BASE}/pools?${query.toString()}`, {
      provider: "Meteora metadata",
      signal,
      init: {
        headers: { Accept: "application/json" },
      },
    });
  }
}
