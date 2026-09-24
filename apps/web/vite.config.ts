import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

/** Mirrors the CloudFront function: pretty URLs map onto static HTML files. */
function prettyUrls(): Plugin {
  return {
    name: "wkc-pretty-urls",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith("/thanks") && !req.url.startsWith("/thanks.html")) {
          req.url = req.url.replace(/^\/thanks/, "/thanks.html");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), prettyUrls()],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        thanks: resolve(import.meta.dirname, "thanks.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
