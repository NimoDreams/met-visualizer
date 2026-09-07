import { defineConfig, devices } from "@playwright/test";

const configuredPreviewPort = process.env.PLAYWRIGHT_PORT;
const previewPort = configuredPreviewPort ?? "4173";
if (
  !/^\d{1,5}$/.test(previewPort) ||
  Number(previewPort) < 1_024 ||
  Number(previewPort) > 65_535
) {
  throw new Error(
    "PLAYWRIGHT_PORT must be an integer from 1024 through 65535.",
  );
}
const previewUrl = `http://127.0.0.1:${previewPort}/met-visualizer/`;
const chromium = {
  name: "chromium",
  use: { ...devices["Desktop Chrome"] },
};
const crossEngineProjects = [
  chromium,
  {
    name: "firefox",
    use: { ...devices["Desktop Firefox"] },
  },
  {
    name: "webkit",
    use: { ...devices["Desktop Safari"] },
  },
];

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: previewUrl,
    trace: "on-first-retry",
  },
  projects:
    process.env.PLAYWRIGHT_ALL_ENGINES === "1"
      ? crossEngineProjects
      : [chromium],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${previewPort}`,
    url: previewUrl,
    reuseExistingServer: !process.env.CI && configuredPreviewPort === undefined,
    timeout: 120_000,
  },
});
