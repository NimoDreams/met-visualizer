import {
  NativeReadOnlySolanaRpc,
  type ReadOnlySolanaRpc,
} from "../providers/solanaRpc";

export type RpcSession = {
  client: ReadOnlySolanaRpc;
  signal: AbortSignal;
};

export class RpcSessionManager {
  #controller?: AbortController;

  connect(endpoint: string): RpcSession {
    const client = new NativeReadOnlySolanaRpc(endpoint);
    this.disconnect();
    const controller = new AbortController();
    this.#controller = controller;

    return {
      client,
      signal: controller.signal,
    };
  }

  disconnect(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }
}
