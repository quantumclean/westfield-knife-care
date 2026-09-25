// Tiny static server for the composition. Everything it serves is local
// (the composition, node_modules, cues.json), so a render never
// touches the network. Run directly to preview in a browser:
//   node serve.mjs   ->  http://127.0.0.1:4173/composition/?mode=landscape&cut=b
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function startServer(port = 4173) {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(root, path.normalize(p));
      if (!file.startsWith(root)) throw Object.assign(new Error("forbidden"), { code: 403 });
      await stat(file);
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(await readFile(file));
    } catch (err) {
      res.writeHead(err.code === 403 ? 403 : 404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  await startServer(port);
  for (const cut of ["a", "b"]) {
    console.log(`http://127.0.0.1:${port}/composition/?mode=landscape&cut=${cut}`);
    console.log(`http://127.0.0.1:${port}/composition/?mode=square&cut=${cut}`);
  }
}
