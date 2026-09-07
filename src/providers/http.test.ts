import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_RETRY_AFTER_MS,
  PUBLIC_JSON_MAX_BYTES,
  ProviderRequestError,
  parseRetryAfter,
  requestJson,
  safeTimerDelay,
} from "./http";

describe("requestJson", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("accepts Content-Length at the public limit", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response("{}", {
        headers: { "Content-Length": String(PUBLIC_JSON_MAX_BYTES) },
      }),
    );

    await expect(
      requestJson("https://provider.example.invalid", { provider: "Public" }),
    ).resolves.toEqual({});
  });

  it("preserves the 15-second per-request timeout", async () => {
    const timer = vi.spyOn(window, "setTimeout");
    vi.spyOn(window, "fetch").mockResolvedValue(Response.json({ ok: true }));

    await requestJson("https://provider.example.invalid", {
      provider: "Public",
    });

    expect(timer).toHaveBeenCalledWith(expect.any(Function), 15_000);
  });

  it("rejects Content-Length above the limit before reading or parsing", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(stream, {
        headers: { "Content-Length": String(PUBLIC_JSON_MAX_BYTES + 1) },
      }),
    );
    const parse = vi.spyOn(JSON, "parse");

    await expect(
      requestJson("https://provider.example.invalid/private?key=secret", {
        provider: "Public",
      }),
    ).rejects.toMatchObject({
      kind: "limit",
      message: "Public response exceeded the safe size limit.",
    } satisfies Partial<ProviderRequestError>);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
  });

  it("streams chunked responses and cancels at N+1 before parsing", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('{"ok":true}x')];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else return;
      },
      cancel,
    });
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(stream));
    const parse = vi.spyOn(JSON, "parse");

    await expect(
      requestJson("https://provider.example.invalid", {
        provider: "Chunked provider",
        maxResponseBytes: 10,
      }),
    ).rejects.toMatchObject({ kind: "limit" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
  });

  it("parses a no-Content-Length stream exactly at N bytes", async () => {
    const bytes = new TextEncoder().encode('{"ok":true}');
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 4));
            controller.enqueue(bytes.subarray(4));
            controller.close();
          },
        }),
      ),
    );

    await expect(
      requestJson("https://provider.example.invalid", {
        provider: "Chunked provider",
        maxResponseBytes: bytes.byteLength,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("returns redacted invalid-JSON errors", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(new Response("not-json"));

    await expect(
      requestJson("https://provider.example.invalid/private?key=secret", {
        provider: "Public",
      }),
    ).rejects.toMatchObject({
      kind: "invalid-json",
      message: "Public returned invalid JSON.",
    });
  });
});

describe("transport timer limits", () => {
  it("caps numeric and date Retry-After values at five minutes", () => {
    const now = Date.parse("2026-09-07T00:00:00Z");
    expect(parseRetryAfter("299", now)).toBe(299_000);
    expect(parseRetryAfter("300", now)).toBe(MAX_RETRY_AFTER_MS);
    expect(parseRetryAfter("301", now)).toBe(MAX_RETRY_AFTER_MS);
    expect(parseRetryAfter("9".repeat(400), now)).toBe(MAX_RETRY_AFTER_MS);
    expect(parseRetryAfter("2099-01-01T00:00:00Z", now)).toBe(
      MAX_RETRY_AFTER_MS,
    );
  });

  it("keeps timer arguments below the signed 32-bit ceiling", () => {
    expect(safeTimerDelay(2_147_483_646)).toBe(2_147_483_646);
    expect(safeTimerDelay(2_147_483_647)).toBe(2_147_483_646);
    expect(safeTimerDelay(Number.MAX_VALUE)).toBe(2_147_483_646);
    expect(safeTimerDelay(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
