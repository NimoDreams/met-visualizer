export const PUBLIC_JSON_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_RETRY_AFTER_MS = 5 * 60_000;
export const MAX_TIMER_DELAY_MS = 2_147_483_646;

export type ProviderRequestErrorKind =
  "http" | "network" | "timeout" | "limit" | "invalid-json";

export class ProviderRequestError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | undefined,
    message: string,
    readonly retryAfterMs?: number,
    readonly kind: ProviderRequestErrorKind = "network",
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

type RequestJsonOptions = {
  provider: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
  init?: RequestInit;
};

export async function requestJson<T>(
  url: string,
  {
    provider,
    signal,
    timeoutMs = 15_000,
    maxResponseBytes = PUBLIC_JSON_MAX_BYTES,
    init,
  }: RequestJsonOptions,
): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(
    () => timeoutController.abort(),
    safeTimerDelay(timeoutMs),
  );

  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.any(
        signal
          ? [signal, timeoutController.signal]
          : [timeoutController.signal],
      ),
    });

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      throw new ProviderRequestError(
        provider,
        response.status,
        `${provider} request failed with HTTP ${response.status}.`,
        retryAfter ? parseRetryAfter(retryAfter) : undefined,
        "http",
      );
    }

    return await readBoundedJson<T>(response, provider, maxResponseBytes);
  } catch (error) {
    if (error instanceof ProviderRequestError || signal?.aborted) {
      throw error;
    }

    if (timeoutController.signal.aborted) {
      throw new ProviderRequestError(
        provider,
        undefined,
        `${provider} request timed out.`,
        undefined,
        "timeout",
      );
    }

    throw new ProviderRequestError(
      provider,
      undefined,
      `${provider} request could not be completed.`,
      undefined,
      "network",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

async function readBoundedJson<T>(
  response: Response,
  provider: string,
  maxBytes: number,
): Promise<T> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new ProviderRequestError(
      provider,
      undefined,
      `${provider} response limit is invalid.`,
      undefined,
      "limit",
    );
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength)) {
    const exceedsLimit = BigInt(contentLength) > BigInt(maxBytes);
    if (exceedsLimit) {
      await cancelBody(response.body);
      throw responseLimitError(provider);
    }
  }

  if (!response.body) throw invalidJsonError(provider);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size failure remains authoritative if cancellation races.
        }
        throw responseLimitError(provider);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      provider,
      undefined,
      `${provider} response could not be read.`,
      undefined,
      "network",
    );
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw invalidJsonError(provider);
  }
}

async function cancelBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The safe-size failure remains authoritative if cancellation races.
  }
}

function responseLimitError(provider: string): ProviderRequestError {
  return new ProviderRequestError(
    provider,
    undefined,
    `${provider} response exceeded the safe size limit.`,
    undefined,
    "limit",
  );
}

function invalidJsonError(provider: string): ProviderRequestError {
  return new ProviderRequestError(
    provider,
    undefined,
    `${provider} returned invalid JSON.`,
    undefined,
    "invalid-json",
  );
}

export function parseRetryAfter(
  value: string,
  now = Date.now(),
): number | undefined {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }
  if (/^\d+$/.test(value.trim())) return MAX_RETRY_AFTER_MS;

  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(Math.max(0, date - now), MAX_RETRY_AFTER_MS)
    : undefined;
}

export function safeTimerDelay(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_TIMER_DELAY_MS);
}
