import { expect, test } from "@playwright/test";

test("serves the project base and preserves hash navigation across reload", async ({
  page,
}) => {
  await page.goto("./#/docs");

  await expect(page).toHaveURL(/\/met-visualizer\/#\/docs$/);
  await expect(page.getByRole("heading", { name: "Docs" })).toBeVisible();
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("src")),
    );
  expect(
    scripts.every((source) => source?.startsWith("/met-visualizer/")),
  ).toBe(true);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Docs" })).toBeVisible();

  await page.getByRole("link", { name: "Visualizer", exact: true }).click();
  await expect(
    page.getByRole("img", {
      name: "Reference candlestick chart awaiting a token",
    }),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("clears the RPC on reload and never puts it in storage or the URL", async ({
  page,
}) => {
  const marker = "browser-secret-marker";
  await page.goto("./#/");

  await page
    .getByLabel("Your Solana RPC endpoint")
    .fill(`https://rpc.example.invalid/?key=${marker}`);
  await page.getByRole("button", { name: "Connect RPC" }).click();

  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Your Solana RPC endpoint")).toHaveValue("");
  expect(page.url()).not.toContain(marker);
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });

  await page.reload();
  await expect(page.getByText("Required")).toBeVisible();
  await expect(page.getByLabel("Your Solana RPC endpoint")).toHaveValue("");
  expect(await page.content()).not.toContain(marker);
});
