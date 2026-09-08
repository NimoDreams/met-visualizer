import { expect, test } from "@playwright/test";
import {
  candleFixture,
  candleResponse,
} from "../../src/test/fixtures/geckoTerminal";

const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const REPORTED_MINTS = [
  "BsbsB3WLq7vbY5En3MBCAsTrcwaCxNKY2Mp5pGuLpump",
  "FFT4bgyrvzyB5TKAziLkAzBj8mboduzJeDdZ27TU4FHm",
] as const;

test.skip(
  !process.env.RUN_PROVIDER_PROOFS,
  "Live provider proofs run explicitly, outside deterministic CI.",
);

test("@provider reported token CAs load usable live reference charts", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const geckoStatuses: number[] = [];
  page.on("response", (response) => {
    if (
      response.url().startsWith("https://api.geckoterminal.com/") &&
      response.url().includes("/pools?")
    ) {
      geckoStatuses.push(response.status());
    }
  });
  await page.route("https://api.geckoterminal.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/pools?")) {
      await route.continue();
      return;
    }
    if (url.includes("/ohlcv/")) {
      await route.fulfill({
        json: candleResponse(
          candleFixture(Math.floor(Date.now() / 1_000) - 24 * 3_600, 96),
        ),
      });
      return;
    }
    const mint = decodeURIComponent(url.split("/tokens/").at(-1) ?? "");
    await route.fulfill({
      json: {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Reported token compatibility proof",
            symbol: "LIVE",
            decimals: 6,
            price_usd: "1",
            market_cap_usd: "1000000",
          },
        },
      },
    });
  });
  await page.route("https://rpc.issue-64.invalid/**", async (route) => {
    const body = route.request().postDataJSON() as {
      id: number;
      method: string;
    };
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: body.id,
        result:
          body.method === "getTokenSupply"
            ? { value: { amount: "1", decimals: 0 } }
            : { context: { slot: 1 }, value: [] },
      },
    });
  });
  await page.route("https://dlmm.datapi.meteora.ag/**", async (route) => {
    await route.fulfill({
      json: { current_page: 1, pages: 1, page_size: 20, total: 0, data: [] },
    });
  });

  await page.goto("./#/");
  await page
    .getByLabel("Your Solana RPC endpoint")
    .fill("https://rpc.issue-64.invalid/");
  await page.getByRole("button", { name: "Connect RPC" }).click();

  for (const mint of REPORTED_MINTS) {
    await page.getByLabel("Token contract address (CA)").fill(mint);
    await page.getByRole("button", { name: "Load token" }).click();
    await expect(
      page.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(".chart-panel .chart-canvas"),
    ).not.toHaveAttribute("aria-label", /awaiting a token/i);
    await expect(page.getByRole("button", { name: "Retry chart" })).toHaveCount(
      0,
    );
  }
  expect(geckoStatuses).toHaveLength(2);
  expect(geckoStatuses.every((status) => status === 200)).toBe(true);
});

test("@provider Meteora metadata accepts the intended browser request shape", async ({
  page,
}) => {
  await page.goto("./#/");
  const result = await page.evaluate(async (mint) => {
    const query = new URLSearchParams({
      filter_by: `token_x=${mint}`,
      sort_by: "tvl:desc",
      page_size: "20",
      page: "1",
    });
    const response = await fetch(
      `https://dlmm.datapi.meteora.ag/pools?${query.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const body: unknown = response.ok ? await response.json() : undefined;
    let shape:
      | {
          currentPage: unknown;
          pageCount: unknown;
          pageSize: unknown;
          total: unknown;
          rows: number;
        }
      | undefined;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      shape = {
        currentPage: record.current_page,
        pageCount: record.pages,
        pageSize: record.page_size,
        total: record.total,
        rows: Array.isArray(record.data) ? record.data.length : -1,
      };
    }
    return {
      ok: response.ok,
      status: response.status,
      type: response.type,
      contentType: response.headers.get("content-type"),
      shape,
    };
  }, JUP_MINT);

  expect(result).toMatchObject({
    ok: true,
    status: 200,
    type: "cors",
  });
  expect(result.contentType).toContain("application/json");
  expect(result.shape).toMatchObject({ currentPage: 1, pageSize: 20 });
  expect(result.shape?.rows).toBeGreaterThan(0);
  expect(Number(result.shape?.pageCount)).toBe(
    Math.ceil(Number(result.shape?.total) / 20),
  );
});
