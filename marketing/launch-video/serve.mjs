// Tiny static server for the composition. Everything it serves is local
// (the composition, node_modules, cues.json, assets/), so a render never
// touches the network. Run directly to preview in a browser:
//   node serve.mjs   ->  http://127.0.0.1:4173/composition/?mode=landscape
import http from "node:http";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";

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

/** Build files the composition expects but that depend on config. */
export async function prepare() {
  const cues = JSON.parse(await readFile(path.join(root, "cues.json"), "utf8"));
  const out = path.join(root, "composition", "generated");
  await mkdir(out, { recursive: true });
  const qr = await QRCode.toString(`https://${cues.url}`, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#111814", light: "#ffffff" },
  });
  await writeFile(path.join(out, "qr.svg"), qr);
}

export async function startServer(port = 4173) {
  await prepare();
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
  console.log(`http://127.0.0.1:${port}/composition/?mode=landscape`);
  console.log(`http://127.0.0.1:${port}/composition/?mode=square`);
}
