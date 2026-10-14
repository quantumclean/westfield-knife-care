import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Browser checks for the game-lab prototype only, separate from the site's
 * e2e suite. Runs against the game-lab dev server, or with
 * GAME_LAB_STATIC=1 against the built static site served from a subpath
 * (after `pnpm build:game-lab`), to prove its relative asset paths work, or
 * with GAME_LAB_STATIC=artifact against the single-file build (after
 * `pnpm build:game-lab --mode artifact`).
 */
const tmp = resolve(import.meta.dirname, "../../../.tmp");
const isStatic = Boolean(process.env.GAME_LAB_STATIC);
const staticPath =
  process.env.GAME_LAB_STATIC === "artifact" ? "game-lab-dist/artifact-preview/" : "game-lab-dist/";
const baseURL = isStatic
  ? `http://127.0.0.1:5209/${staticPath}`
  : "http://127.0.0.1:5208/game-lab/";

export default defineConfig({
  testDir: "./e2e",
  outputDir: resolve(tmp, "game-lab-results"),
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL,
    channel: process.env.WKC_BROWSER_CHANNEL,
    launchOptions: { executablePath: process.env.WKC_BROWSER_EXECUTABLE },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "iphone-sized",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
      },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 }, colorScheme: "light" },
    },
  ],
  webServer: isStatic
    ? {
        command: `python3 -m http.server 5209 --bind 127.0.0.1 --directory "${tmp}"`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 30000,
      }
    : {
        command: "pnpm exec vite --port 5208 --host 127.0.0.1 --strictPort",
        cwd: import.meta.dirname,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60000,
      },
});
