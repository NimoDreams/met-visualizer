import { expect, test } from "@playwright/test";
import {
  candleFixture,
  candleResponse,
  poolResponse,
  TOKEN_MINT,
  tokenResponse,
} from "../../src/test/fixtures/geckoTerminal";
import oracle from "../../src/test/fixtures/lbPairOracle.json" with { type: "json" };
import positionOracle from "../../src/test/fixtures/positionOracle.json" with { type: "json" };
import { encodeBase58 } from "../../src/domain/base58";

test("discovers, ranks, and expands a DLMM pool without exposing the RPC", async ({
  page,
}) => {
  const rpcMarker = "dlmm-browser-secret";
  const externalRequests: string[] = [];
  const now = Math.floor(Date.now() / 1_000);
  const positionAddresses = Array.from({ length: 1_800 }, (_, index) =>
    numberedAddress(index),
  );

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
      const binArrayScan = config.filters[0]?.memcmp.bytes === "GUunkrC2gRJ";
      const tokenYScan = config.filters[1]?.memcmp.offset === 120;
      result = {
        context: { slot: binArrayScan ? 105 : positionProbe ? 103 : 100 },
        value: binArrayScan
          ? positionOracle.binArrayData.map((data, index) => ({
              pubkey: `bin-${index}`,
              account: rpcAccount(data),
            }))
          : positionProbe
            ? positionAddresses.map((pubkey) => ({
                pubkey,
                account: rpcAccount(""),
              }))
            : tokenYScan
              ? [{ pubkey: oracle.address, account: rpcAccount("") }]
              : [],
      };
    } else if (body.method === "getMultipleAccounts") {
      const addresses = body.params[0] as string[];
      result = {
        context: { slot: addresses[0] === oracle.address ? 101 : 104 },
        value: addresses.map((address) =>
          rpcAccount(
            address === oracle.address
              ? poolAtActiveBinZero()
              : positionOracle.positionData,
          ),
        ),
      };
    } else if (body.method === "getTokenSupply") {
      result = { context: { slot: 105 }, value: { amount: "1", decimals: 6 } };
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
  await expect(page.getByText("1,800", { exact: true })).toBeVisible();
  await expect(page.getByText("100 / 1,800 positions loaded")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Value coverage: 5.5%")).toBeVisible();
  await expect(
    page.getByText(/USD quote observed.*GeckoTerminal/),
  ).toBeVisible();

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

function numberedAddress(index: number): string {
  const bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setUint32(28, index + 1, false);
  return encodeBase58(bytes);
}

function poolAtActiveBinZero(): string {
  const bytes = Buffer.from(oracle.data, "base64");
  bytes.writeInt32LE(0, 76);
  bytes.writeUInt16LE(100, 80);
  return bytes.toString("base64");
}
