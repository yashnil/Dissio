import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for accessibility and integration tests.
 * Tests run against the Next.js dev server started locally.
 * CI: set BASE_URL env var to point at a running preview.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      // Uses Chromium at tablet viewport. iPad (gen 7) uses WebKit which requires
      // a separate `npx playwright install webkit` step not included in this setup.
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
  ],

  // Start the Next.js dev server before running tests (local only)
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
