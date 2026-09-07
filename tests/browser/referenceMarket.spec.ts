import { expect, test } from "@playwright/test";
import {
  candleFixture,
  candleResponse,
  poolResponse,
  TOKEN_MINT,
  tokenResponse,
} from "../../src/test/fixtures/geckoTerminal";
import { expectMinimumTouchTargets } from "./touchTargets";

test("loads an identified keyless reference chart without disclosing the RPC", async ({
  page,
}) => {
  const rpcMarker = "rpc-browser-proof-secret";
  const marketRequests: string[] = [];
  const now = Math.floor(Date.now() / 1_000);

  await page.route("https://api.geckoterminal.com/**", async (route) => {
    marketRequests.push(route.request().url());
    const url = route.request().url();
    const json = url.includes("/ohlcv/")
      ? candleResponse(candleFixture(now - 24 * 3_600, 96))
      : url.includes("/pools?")
        ? poolResponse("browser-pool")
        : tokenResponse();
    await route.fulfill({ json });
  });
  await page.route("https://rpc.example.invalid/**", async (route) => {
    await route.fulfill({
      json: { jsonrpc: "2.0", id: 1, result: { value: null } },
    });
  });

  await page.goto("./#/");
  await page
    .getByLabel("Your Solana RPC endpoint")
    .fill(`https://rpc.example.invalid/?key=${rpcMarker}`);
  await page.getByRole("button", { name: "Connect RPC" }).click();
  await page.getByLabel("Token contract address (CA)").fill(TOKEN_MINT);
  await page.getByRole("button", { name: "Load token" }).click();

  await expect(
    page.getByRole("heading", { name: "Fixture Token FIX" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /FIX Market Cap/ })).toBeVisible();
  await expect(
    page.getByText(/Market Cap \(USD\).*CoinGecko verified/),
  ).toBeVisible();
  await expect(page.getByLabel("Reference market")).toHaveValue("browser-pool");
  await expect(
    page.locator(".market-metadata dd").filter({
      hasText: "FIX / USDC · meteora-dlmm",
    }),
  ).toBeVisible();
  await expect(page.getByText(/Historical Market Cap/)).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry pools" })).toBeVisible();
  await expect(page.getByRole("img", { name: /FIX Market Cap/ })).toBeVisible();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expectMinimumTouchTargets([
      page.getByLabel("Reference market"),
      page.getByRole("button", { name: "Refresh", exact: true }),
    ]);
    await expect(page.getByLabel("Reference market")).toHaveValue(
      "browser-pool",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Positions", exact: true }).click();
    await expectMinimumTouchTargets([
      page.getByRole("button", { name: "Retry pools" }),
    ]);
    await page.getByRole("button", { name: "Chart" }).click();
  }

  expect(marketRequests.length).toBe(3);
  expect(marketRequests.every((url) => !url.includes(rpcMarker))).toBe(true);
  expect(await page.content()).not.toContain(rpcMarker);
  expect(
    await page.evaluate(() => ({ ...localStorage, ...sessionStorage })),
  ).toEqual({});
});

test("keeps last-good chart data visible when a manual refresh fails", async ({
  page,
}) => {
  const now = Math.floor(Date.now() / 1_000);
  let candleRequests = 0;
  const candleUrls: string[] = [];
  await page.route("https://api.geckoterminal.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/ohlcv/")) {
      candleRequests += 1;
      candleUrls.push(url);
      if (candleRequests > 1) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        json: candleResponse(candleFixture(now - 24 * 3_600, 96)),
      });
      return;
    }
    await route.fulfill({
      json: url.includes("/pools?")
        ? poolResponse("stale-browser-pool")
        : tokenResponse(),
    });
  });

  await page.goto("./#/");
  await page
    .getByLabel("Your Solana RPC endpoint")
    .fill("https://rpc.example.invalid/");
  await page.getByRole("button", { name: "Connect RPC" }).click();
  await page.getByLabel("Token contract address (CA)").fill(TOKEN_MINT);
  await page.getByRole("button", { name: "Load token" }).click();
  await expect(page.getByRole("img", { name: /FIX Market Cap/ })).toBeVisible();

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Stale", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Last-good candles remain visible/),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /FIX Market Cap/ })).toBeVisible();
  expect(candleUrls.at(-1)).toContain("limit=10");
});

test("recovers the chart independently while an empty RPC pool result remains usable", async ({
  page,
}) => {
  let chartAvailable = false;
  const now = Math.floor(Date.now() / 1_000);
  await page.route("https://api.geckoterminal.com/**", async (route) => {
    if (!chartAvailable) {
      await route.abort("failed");
      return;
    }
    const url = route.request().url();
    await route.fulfill({
      json: url.includes("/ohlcv/")
        ? candleResponse(candleFixture(now - 24 * 3_600, 96))
        : url.includes("/pools?")
          ? poolResponse("recovered-pool")
          : tokenResponse(),
    });
  });
  await page.route("https://dlmm.datapi.meteora.ag/**", async (route) => {
    await route.fulfill({
      json: { current_page: 1, pages: 1, page_size: 20, total: 0, data: [] },
    });
  });
  await page.route("https://rpc.example.invalid/**", async (route) => {
    const body = route.request().postDataJSON() as { id: number };
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: body.id,
        result: { context: { slot: 100 }, value: [] },
      },
    });
  });

  await page.goto("./#/");
  await page
    .getByLabel("Your Solana RPC endpoint")
    .fill("https://rpc.example.invalid/");
  await page.getByRole("button", { name: "Connect RPC" }).click();
  await page.getByLabel("Token contract address (CA)").fill(TOKEN_MINT);
  await page.getByRole("button", { name: "Load token" }).click();

  await expect(page.getByRole("button", { name: "Retry chart" })).toBeVisible();
  await expect(page.getByText("0 of 0 pools enabled")).toBeVisible();
  await expect(
    page.getByText(/No Meteora DLMM pools were discovered/),
  ).toBeVisible();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expectMinimumTouchTargets([
      page.getByRole("button", { name: "Retry chart" }),
    ]);
  }

  chartAvailable = true;
  await page.getByRole("button", { name: "Retry chart" }).click();
  await expect(page.getByRole("img", { name: /FIX Market Cap/ })).toBeVisible();
  await page.getByRole("button", { name: "Positions", exact: true }).click();
  await expect(page.getByText("0 of 0 pools enabled")).toBeVisible();
});
