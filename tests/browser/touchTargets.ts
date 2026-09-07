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
      box!.width,
      `touch width for ${await accessibleName(locator)}`,
    ).toBeGreaterThanOrEqual(minimum);
    expect(
      box!.height,
      `touch height for ${await accessibleName(locator)}`,
    ).toBeGreaterThanOrEqual(minimum);
  }
}

async function accessibleName(locator: Locator): Promise<string> {
  return (
    (await locator.getAttribute("aria-label")) ??
    (await locator.textContent())?.trim() ??
    locator.toString()
  );
}
