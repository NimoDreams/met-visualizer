import { expect, type Locator } from "@playwright/test";

export async function expectMinimumTouchTargets(
  locators: readonly Locator[],
  minimum = 44,
): Promise<void> {
  for (const locator of locators) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(
      box,
      `missing bounds for ${await accessibleName(locator)}`,
    ).not.toBeNull();
    expect(
      roundedCssPixels(box!.width),
      `touch width for ${await accessibleName(locator)}`,
    ).toBeGreaterThanOrEqual(minimum);
    expect(
      roundedCssPixels(box!.height),
      `touch height for ${await accessibleName(locator)}`,
    ).toBeGreaterThanOrEqual(minimum);
  }
}

// Engines can report a CSS-pixel boundary with floating-point noise, such as
// 43.999998 for a computed 44px control. Hundredth-pixel rounding preserves the
// contract while still failing any visually meaningful shortfall.
function roundedCssPixels(value: number): number {
  return Math.round(value * 100) / 100;
}

async function accessibleName(locator: Locator): Promise<string> {
  return (
    (await locator.getAttribute("aria-label")) ??
    (await locator.textContent())?.trim() ??
    locator.toString()
  );
}
