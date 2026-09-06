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
      page_size: "20",
      page: "1",
    });
    const response = await fetch(
      `https://dlmm.datapi.meteora.ag/pools?${query.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const body: unknown = response.ok ? await response.json() : undefined;
    let shape:
      { currentPage: unknown; pageSize: unknown; rows: number } | undefined;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      shape = {
        currentPage: record.current_page,
        pageSize: record.page_size,
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
});
