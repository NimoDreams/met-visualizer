import { chromium } from "@playwright/test";

const APP_URL = "http://127.0.0.1:4173/met-visualizer/#/";
const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const PUBLIC_MARKET_HOSTS = new Set([
  "api.geckoterminal.com",
  "dlmm.datapi.meteora.ag",
]);

let stage = "validate input";
let browser;

try {
  const endpoint = process.env.MET_VISUALIZER_RPC_URL;
  delete process.env.MET_VISUALIZER_RPC_URL;
  if (!endpoint || new URL(endpoint).protocol !== "https:") fail();

  stage = "launch browser";
  browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let rpcCalls = 0;
  let publicCalls = 0;
  let leakedToAnotherRequest = false;

  page.on("request", (request) => {
    const requestUrl = request.url();
    if (requestUrl === endpoint) {
      rpcCalls += 1;
      return;
    }
    const host = new URL(requestUrl).hostname;
    if (PUBLIC_MARKET_HOSTS.has(host)) publicCalls += 1;
    if (requestUrl.includes(endpoint)) leakedToAnotherRequest = true;
  });

  stage = "open preview";
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

  stage = "connect RPC";
  await page.getByLabel("Your Solana RPC endpoint").fill(endpoint);
  await page.getByRole("button", { name: "Connect RPC" }).click();
  await page.getByLabel("Token contract address (CA)").fill(JUP_MINT);
  await page.getByRole("button", { name: "Load token" }).click();

  stage = "load live pool discovery";
  await page.locator(".pool-status strong").waitFor({
    state: "visible",
    timeout: 180_000,
  });
  if (rpcCalls === 0 || publicCalls === 0 || leakedToAnotherRequest) fail();

  stage = "check in-session privacy";
  if (
    await page
      .locator("body")
      .innerText()
      .then((text) => text.includes(endpoint))
  )
    fail();
  if (page.url().includes(endpoint)) fail();
  if (await browserStorageContains(page, endpoint)) fail();

  stage = "check reload clearing";
  await page.reload({ waitUntil: "domcontentloaded" });
  if ((await page.getByLabel("Your Solana RPC endpoint").inputValue()) !== "")
    fail();
  if (!(await page.getByText("Required", { exact: true }).isVisible())) fail();
  if (await browserStorageContains(page, endpoint)) fail();

  console.log(
    `User-RPC browser smoke passed (${rpcCalls} read-only RPC calls; ${publicCalls} public market-data calls).`,
  );
} catch {
  console.error(`User-RPC browser smoke failed during: ${stage}.`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

function fail() {
  throw new Error("sanitized verification failure");
}

async function browserStorageContains(page, endpoint) {
  return page.evaluate(async (privateEndpoint) => {
    const stored = [
      ...Object.entries(localStorage),
      ...Object.entries(sessionStorage),
    ];
    if (
      stored.some(
        ([key, value]) =>
          key.includes(privateEndpoint) || value.includes(privateEndpoint),
      )
    )
      return true;

    if ((await navigator.serviceWorker?.getRegistrations())?.length)
      return true;
    const cacheNames =
      "caches" in globalThis ? await globalThis.caches.keys() : [];
    for (const cacheName of cacheNames) {
      const requests = await (await globalThis.caches.open(cacheName)).keys();
      if (requests.some((request) => request.url.includes(privateEndpoint)))
        return true;
    }

    const databases = await globalThis.indexedDB.databases?.();
    return Boolean(databases?.length);
  }, endpoint);
}
