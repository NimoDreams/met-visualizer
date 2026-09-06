import { expect, test } from "@playwright/test";
import {
  candleFixture,
  candleResponse,
  poolResponse,
  TOKEN_MINT,
  tokenResponse,
} from "../../src/test/fixtures/geckoTerminal";

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
