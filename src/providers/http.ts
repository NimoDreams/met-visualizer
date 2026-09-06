export class ProviderRequestError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

type RequestJsonOptions = {
  provider: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  init?: RequestInit;
};

export async function requestJson<T>(
  url: string,
  { provider, signal, timeoutMs = 15_000, init }: RequestJsonOptions,
): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(), timeoutMs);

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
      throw new ProviderRequestError(
        provider,
        response.status,
        `${provider} request failed with HTTP ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProviderRequestError || signal?.aborted) {
      throw error;
    }

    if (timeoutController.signal.aborted) {
      throw new ProviderRequestError(
        provider,
        undefined,
        `${provider} request timed out.`,
      );
    }

    throw new ProviderRequestError(
      provider,
      undefined,
      `${provider} request could not be completed.`,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
