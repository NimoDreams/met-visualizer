import { expect, test } from "@playwright/test";
import {
  candleFixture,
  candleResponse,
  poolResponse,
  TOKEN_MINT,
  tokenResponse,
} from "../../src/test/fixtures/geckoTerminal";
import oracle from "../../src/test/fixtures/lbPairOracle.json" with { type: "json" };

test("discovers, ranks, and expands a DLMM pool without exposing the RPC", async ({
  page,
}) => {
  const rpcMarker = "dlmm-browser-secret";
  const externalRequests: string[] = [];
  const now = Math.floor(Date.now() / 1_000);

  await page.route("https://api.geckoterminal.com/**", async (route) => {
    const url = route.request().url();
    externalRequests.push(url);
    if (url.includes("/simple/")) {
      await route.fulfill({
        json: {
          data: {
            id: "quotes",
            type: "simple_token_price",
            attributes: {
              token_prices: { [oracle.expected.tokenXMint]: "1.25" },
            },
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: url.includes("/ohlcv/")
        ? candleResponse(candleFixture(now - 24 * 3_600, 96))
        : url.includes("/pools?")
          ? poolResponse("browser-reference-pool")
          : tokenResponse(),
    });
  });
  await page.route("https://dlmm.datapi.meteora.ag/**", async (route) => {
    const url = route.request().url();
    externalRequests.push(url);
    const orientation = new URL(url).searchParams
      .get("filter_by")
      ?.startsWith("token_x=")
      ? "x"
      : "y";
    const data =
      orientation === "y"
        ? [
            {
              address: oracle.address,
              name: "JUP-SOL",
              token_x: {
                address: oracle.expected.tokenXMint,
                symbol: "JUP",
              },
              token_y: {
                address: oracle.expected.tokenYMint,
                symbol: "SOL",
              },
              tvl: 50_000,
              volume: { "24h": 25_000 },
              is_blacklisted: false,
            },
          ]
        : [];
    await route.fulfill({
      json: {
        current_page: 1,
        pages: 1,
        page_size: 20,
        total: data.length,
        data,
      },
    });
  });
  await page.route("https://rpc.example.invalid/**", async (route) => {
    const body = route.request().postDataJSON() as {
      id: number;
      method: string;
      params: unknown[];
    };
    let result: unknown;
    if (body.method === "getProgramAccounts") {
      const config = body.params[1] as {
        filters: Array<{ memcmp: { bytes: string; offset: number } }>;
      };
      const positionProbe = config.filters[0]?.memcmp.bytes === "LgkNAEYaVX3";
      const tokenYScan = config.filters[1]?.memcmp.offset === 120;
      result = {
        context: { slot: positionProbe ? 102 : 100 },
        value:
          positionProbe || tokenYScan
            ? [{ pubkey: oracle.address, account: rpcAccount("") }]
            : [],
      };
    } else if (body.method === "getMultipleAccounts") {
      result = {
        context: { slot: 101 },
        value: [rpcAccount(oracle.data)],
      };
    } else {
      result = { value: null };
    }
    await route.fulfill({
      json: { jsonrpc: "2.0", id: body.id, result },
    });
  });

  await page.goto("./#/");
  await page
    .getByLabel("Your Solana RPC endpoint")
    .fill(`https://rpc.example.invalid/?key=${rpcMarker}`);
  await page.getByRole("button", { name: "Connect RPC" }).click();
  await page.getByLabel("Token contract address (CA)").fill(TOKEN_MINT);
  await page.getByRole("button", { name: "Load token" }).click();

  await expect(page.getByText("1 of 1 pools enabled")).toBeVisible();
  await expect(page.getByText("JUP-SOL")).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.getByText("JUP-SOL").click();
  await expect(page.getByText(oracle.address, { exact: true })).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();

  expect(externalRequests.every((url) => !url.includes(rpcMarker))).toBe(true);
  expect(page.url()).not.toContain(rpcMarker);
  expect(await page.content()).not.toContain(rpcMarker);
  expect(
    await page.evaluate(() => ({ ...localStorage, ...sessionStorage })),
  ).toEqual({});
});

function rpcAccount(data: string) {
  return {
    data: [data, "base64"],
    executable: false,
    lamports: 1,
    owner: oracle.owner,
  };
}
