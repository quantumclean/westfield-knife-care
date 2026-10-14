/**
 * Vite config for the game-lab prototype only. It is separate from
 * apps/web/vite.config.ts on purpose: the production build (and so Cloudflare
 * Pages) never sees this page.
 *
 *   pnpm --filter @wkc/web dev:game-lab        http://<host>:5174/game-lab/
 *   pnpm --filter @wkc/web build:game-lab      static site with relative paths
 *   pnpm --filter @wkc/web build:game-lab -- --mode artifact
 *       also writes artifact.html: one self-contained fragment (CSS, JS and
 *       fonts inlined) for a private preview link, plus artifact-preview/ to
 *       test it locally (GAME_LAB_STATIC=artifact pnpm test:game-lab).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

const outDir = resolve(import.meta.dirname, "../../../.tmp/game-lab-dist");

/** Inlines the built page into a single HTML fragment (no external files). */
function singleFile(): Plugin {
  return {
    name: "game-lab-single-file",
    apply: "build",
    writeBundle(_options, bundle) {
      let js = "";
      let css = "";
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.isEntry) js += file.code;
        else if (file.type === "asset" && file.fileName.endsWith(".css"))
          css += String(file.source);
      }
      const page = [
        "<title>The Edge Returns</title>",
        '<meta name="claude:viewport-fit-sides" content="cover">',
        '<meta name="robots" content="noindex, nofollow">',
        `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
        '<div id="game"></div>',
        `<script type="module">${js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--")}</script>`,
        "",
      ].join("\n");
      writeFileSync(resolve(outDir, "artifact.html"), page);
      // The same fragment in a minimal document, the way the preview host wraps
      // it, so the browser checks can run against exactly what gets published.
      mkdirSync(resolve(outDir, "artifact-preview"), { recursive: true });
      writeFileSync(
        resolve(outDir, "artifact-preview/index.html"),
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${page}</body></html>\n`,
      );
    },
  };
}

export default defineConfig(({ command, mode }) => ({
  root: import.meta.dirname,
  base: command === "build" ? "./" : "/game-lab/",
  plugins: [preact(), ...(mode === "artifact" ? [singleFile()] : [])],
  server: { port: 5174, host: true },
  preview: { port: 5174, host: true },
  build: {
    target: "es2022",
    outDir,
    emptyOutDir: true,
    // The artifact build inlines the fonts too, so it needs no other files.
    assetsInlineLimit: mode === "artifact" ? 10_000_000 : 4096,
  },
}));
