// Downloads the stock photos listed in assets/photos.json into
// assets/photos/<slot>.jpg and writes assets/photos/manifest.json, which the
// composition reads to swap a scene's vector art for the photo.
//
//   node fetch-photos.mjs          # download what can be downloaded
//   node fetch-photos.mjs --scan   # only rebuild manifest.json from files present
//
// Look at every photo before rendering: they were chosen by description.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, "assets", "photos");
const sources = JSON.parse(await readFile(path.join(root, "assets", "photos.json"), "utf8"));
await mkdir(dir, { recursive: true });

if (!process.argv.includes("--scan")) {
  for (const [slot, src] of Object.entries(sources)) {
    if (slot.startsWith("_")) continue;
    if (!src.download) {
      console.log(`${slot}: save by hand from ${src.page} as assets/photos/${slot}.jpg`);
      continue;
    }
    try {
      const res = await fetch(src.download, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(path.join(dir, `${slot}.jpg`), Buffer.from(await res.arrayBuffer()));
      console.log(`${slot}: downloaded`);
    } catch (err) {
      console.log(`${slot}: failed (${err.message}); save by hand from ${src.page}`);
    }
  }
}

const present = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const manifest = Object.fromEntries(present.map((f) => [path.parse(f).name, f]));
await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `manifest: ${Object.keys(manifest).join(", ") || "(no photos; vector art will be used)"}`,
);
