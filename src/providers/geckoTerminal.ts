import { requestJson } from "./http";

const GECKO_TERMINAL_BASE =
  "https://api.geckoterminal.com/api/v2/networks/solana";

export interface GeckoTerminalProvider {
  read<T>(path: string, signal?: AbortSignal): Promise<T>;
}

export class PublicGeckoTerminalProvider implements GeckoTerminalProvider {
  read<T>(path: string, signal?: AbortSignal): Promise<T> {
    return requestJson<T>(`${GECKO_TERMINAL_BASE}/${path.replace(/^\//, "")}`, {
      provider: "GeckoTerminal",
      signal,
      init: {
        headers: { Accept: "application/json;version=20230203" },
      },
    });
  }
}
