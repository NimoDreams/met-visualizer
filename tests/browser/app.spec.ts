import { expect, test } from "@playwright/test";
import { expectMinimumTouchTargets } from "./touchTargets";

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

test("supports keyboard navigation, responsive pane switching, and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "See where Meteora liquidity sits around a token.",
    }),
  ).toBeFocused();

  await expect(page.getByLabel("Visible workspace pane")).toBeVisible();
  await page.getByRole("button", { name: "Positions" }).click();
  await expect(page.locator(".workspace-positions")).toBeVisible();
  await expect(page.locator(".workspace-chart")).toBeHidden();
  await expect(page.locator(".compact-workspace-status")).toContainText(
    "Chart waiting · Positions waiting",
  );
  const primaryControls = () => [
    page.getByRole("link", { name: "Met Visualizer home" }),
    page.getByRole("link", { name: "Visualizer", exact: true }),
    page.getByRole("link", { name: "Docs" }),
    page.getByLabel("Your Solana RPC endpoint"),
    page.getByRole("button", { name: "Connect RPC" }),
    page.getByLabel("Token contract address (CA)"),
    page.getByRole("button", { name: "Load token" }),
    page.getByRole("button", { name: "Chart" }),
    page.getByRole("button", { name: "Positions" }),
  ];
  await expectMinimumTouchTargets(primaryControls());
  await page.setViewportSize({ width: 844, height: 390 });
  await expectMinimumTouchTargets(primaryControls());
  await page.setViewportSize({ width: 390, height: 844 });
  const reducedAnimationDuration = await page
    .locator(".mobile-pane-switch")
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(reducedAnimationDuration)).toBeLessThanOrEqual(
    0.00001,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("link", { name: "Docs" }).click();
  await expect(page.getByRole("heading", { name: "Docs" })).toBeFocused();
  await expect(
    page.getByText(/TradingView Lightweight Charts™ Copyright © 2025/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Limits" })).toBeVisible();
  const docsTextContrast = await page
    .locator(".docs-grid section")
    .first()
    .evaluate((section) => {
      const parse = (value: string) =>
        value
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
      const luminance = (rgb: number[]) =>
        rgb
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4,
          )
          .reduce(
            (sum, channel, index) =>
              sum + channel * [0.2126, 0.7152, 0.0722][index]!,
            0,
          );
      const foreground = luminance(
        parse(getComputedStyle(section.querySelector("p")!).color),
      );
      const background = luminance(
        parse(getComputedStyle(section).backgroundColor),
      );
      return (
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05)
      );
    });
  expect(docsTextContrast).toBeGreaterThanOrEqual(4.5);
});
