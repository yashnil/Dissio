import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for accessibility and integration tests.
 * Tests run against the Next.js dev server started locally.
 * CI: set BASE_URL env var to point at a running preview.
 *
 * Port 3100 is dedicated to Dissio's Playwright runs (never 3000) so this
 * suite can't collide with another local app (e.g. PEAK3) that uses 3000.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3100",
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

  // Start the Next.js dev server before running tests (local only), bound to
  // the dedicated Dissio test port 3100.
  //
  // reuseExistingServer is deliberately always false here (not the usual
  // `!process.env.CI`): Playwright's own readiness probe only checks that
  // *something* answers at `url` before deciding whether to reuse it — it
  // cannot verify that whatever is already bound to port 3100 is actually
  // this Dissio frontend. With reuseExistingServer:false, Playwright instead
  // fails loudly ("port already in use") if 3100 is occupied by anything
  // else, rather than silently running the suite against the wrong app.
  // Since 3100 isn't used for normal `npm run dev` (that's still 3000), it
  // should be free in practice — this only trades a slower local run
  // (always a fresh server) for guaranteeing it's always Dissio.
  webServer: process.env.CI
    ? undefined
    : {
        command: "npx next dev -p 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
