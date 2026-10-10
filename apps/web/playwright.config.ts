import { defineConfig } from "@playwright/test";

/**
 * Browser checks for the customer-facing pages. The API is always mocked (see e2e/helpers.ts), so
 * these never touch staging, Stripe or Cloudflare. They use the locally installed Chrome
 * (`channel: "chrome"`), so no browser download is needed. Run with `pnpm --filter @wkc/web e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:5199", channel: "chrome", trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "pnpm exec vite --port 5199 --host 127.0.0.1",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
