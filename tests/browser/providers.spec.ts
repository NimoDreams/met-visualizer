import { expect, test } from "@playwright/test";

const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

test.skip(
  !process.env.RUN_PROVIDER_PROOFS,
  "Live provider proofs run explicitly, outside deterministic CI.",
);

test("@provider GeckoTerminal accepts the intended browser request shape", async ({
  page,
}) => {
  await page.goto("./#/");
  const result = await page.evaluate(async (mint) => {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`,
      { headers: { Accept: "application/json;version=20230203" } },
    );
    return {
      ok: response.ok,
      status: response.status,
      type: response.type,
      contentType: response.headers.get("content-type"),
    };
  }, JUP_MINT);

  expect(result).toMatchObject({
    ok: true,
    status: 200,
    type: "cors",
  });
  expect(result.contentType).toContain("application/json");
});

test("@provider Meteora metadata accepts the intended browser request shape", async ({
  page,
}) => {
  await page.goto("./#/");
  const result = await page.evaluate(async (mint) => {
    const query = new URLSearchParams({
      filter_by: `token_x=${mint}`,
      sort_by: "tvl:desc",
      page_size: "1",
    });
    const response = await fetch(
      `https://dlmm.datapi.meteora.ag/pools?${query.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    return {
      ok: response.ok,
      status: response.status,
      type: response.type,
      contentType: response.headers.get("content-type"),
    };
  }, JUP_MINT);

  expect(result).toMatchObject({
    ok: true,
    status: 200,
    type: "cors",
  });
  expect(result.contentType).toContain("application/json");
});
