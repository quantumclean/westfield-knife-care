import { defineConfig } from "@playwright/test";

// Only local builds. Every API/Apple request is intercepted by the tests.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../.tmp/browser-results",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5207",
    channel: process.env.WKC_BROWSER_CHANNEL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-light",
      use: { viewport: { width: 1280, height: 900 }, colorScheme: "light" },
    },
    {
      name: "mobile-dark",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
      },
    },
    {
      name: "small-mobile-light",
      use: {
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
        colorScheme: "light",
      },
    },
  ],
  webServer: {
    command: `corepack pnpm exec vite ${process.env.WKC_BROWSER_PREVIEW ? "preview" : ""} --port 5207 --host 127.0.0.1 --strictPort`,
    url: "http://127.0.0.1:5207",
    reuseExistingServer: false,
    env: {
      VITE_APPLE_MAPS_TOKEN: process.env.WKC_MAPS_DISABLED ? "" : "test-placeholder-not-a-token",
    },
    timeout: 60000,
  },
});
