import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:4173/met-visualizer/",
    trace: "on-first-retry",
  },
  projects:
    process.env.PLAYWRIGHT_ALL_ENGINES === "1"
      ? crossEngineProjects
      : [chromium],
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4173/met-visualizer/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
