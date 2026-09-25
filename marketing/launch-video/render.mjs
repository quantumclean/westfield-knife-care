// Renders the launch video frame by frame.
//
//   node render.mjs                          # every cut x format -> out/, then encodes
//   node render.mjs --cut b --mode square    # one cut, one format
//   node render.mjs --stills 5.9,14.5        # PNG stills only (visual QA)
//   node render.mjs --publish                # also copy finals into apps/web/public/video
//   node render.mjs --encode-only            # re-encode from existing out/intermediate-*.mp4
//
// Every frame is produced by seeking the paused GSAP timeline to an exact
// time (window.__video.seek) and screenshotting, so output is identical on
// every run and independent of machine speed. Needs ffmpeg on PATH with
// libx264, libvpx-vp9, libopus; audio comes from `npm run audio`.
//
// Cuts (cues.json "cuts") differ only in the pickup/return lines, which must
// match the offer a visitor sees; formats are 16:9 (desktop) and 1:1 (phone).
// Output: launch-{cut}-{format}-v1.{mp4,webm} and -poster.jpg.
import { spawn } from "node:child_process";
import { mkdir, copyFile, stat, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const VERSION = "v1";
const MODES = { landscape: [1920, 1080], square: [1080, 1080] };
const modes = opt("mode", "both") === "both" ? Object.keys(MODES) : [opt("mode")];
const cues = JSON.parse(await readFile(path.join(root, "cues.json"), "utf8"));
const cuts = opt("cut", "all") === "all" ? Object.keys(cues.cuts) : [opt("cut")];
for (const c of cuts) if (!cues.cuts[c]) throw new Error(`unknown cut "${c}"`);
for (const m of modes) if (!MODES[m]) throw new Error(`unknown mode "${m}"`);
const stills = opt("stills", "").split(",").filter(Boolean).map(Number);
const workers = Number(opt("workers", 3));
const outDir = path.join(root, "out");
const publishDir = path.join(root, "..", "..", "apps", "web", "public", "video");

function run(cmd, cmdArgs, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)),
    );
    if (input) input(p.stdin);
  });
}

async function openPage(browser, port, cut, mode) {
  const [width, height] = MODES[mode];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[${cut}/${mode}] page error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/composition/?mode=${mode}&cut=${cut}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
  return page;
}

async function frame(page, t, type = "jpeg") {
  await page.evaluate((time) => window.__video.seek(time), t);
  return page.screenshot({ type, quality: type === "jpeg" ? 95 : undefined, clip: undefined });
}

/** Render frames [from, to) of one cut into an intermediate H.264 file. */
async function renderChunk(browser, port, cut, mode, fps, from, to, file) {
  const page = await openPage(browser, port, cut, mode);
  await run(
    "ffmpeg",
    [
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "mjpeg",
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "10",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    {
      input: async (stdin) => {
        for (let f = from; f < to; f++) {
          const buf = await frame(page, f / fps);
          if (!stdin.write(buf)) await new Promise((r) => stdin.once("drain", r));
        }
        stdin.end();
      },
    },
  );
  await page.close();
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await startServer(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    for (const cut of cuts)
      for (const mode of modes) {
        const tag = `${cut}-${mode}`;
        const probe = await openPage(browser, port, cut, mode);
        const { fps, duration } = await probe.evaluate(() => ({
          fps: window.__video.fps,
          duration: window.__video.duration,
        }));

        if (stills.length) {
          await mkdir(path.join(outDir, "stills"), { recursive: true });
          for (const t of stills) {
            const file = path.join(outDir, "stills", `${tag}-${t.toFixed(2)}.png`);
            await writeFile(file, await frame(probe, t, "png"));
            console.log(file);
          }
          await probe.close();
          continue;
        }
        await probe.close();

        const inter = path.join(outDir, `intermediate-${tag}.mp4`);
        if (!flag("encode-only")) {
          const total = Math.round(duration * fps);
          const per = Math.ceil(total / workers);
          const started = Date.now();
          const chunks = Array.from({ length: workers }, (_, i) => ({
            from: i * per,
            to: Math.min(total, (i + 1) * per),
            file: path.join(outDir, `chunk-${tag}-${i}.mp4`),
          })).filter((c) => c.from < c.to);
          await Promise.all(
            chunks.map((c) => renderChunk(browser, port, cut, mode, fps, c.from, c.to, c.file)),
          );
          const list = path.join(outDir, `chunks-${tag}.txt`);
          await writeFile(list, chunks.map((c) => `file '${c.file}'`).join("\n"));
          await run("ffmpeg", [
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list,
            "-c",
            "copy",
            inter,
          ]);
          for (const c of chunks) await rm(c.file);
          await rm(list);
          console.log(`[${tag}] ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
        }

        const audio = path.join(root, "audio", "soundtrack.wav");
        const hasAudio = await exists(audio);
        const name = `launch-${tag}-${VERSION}`;
        const base = path.join(outDir, name);
        const audioIn = hasAudio ? ["-i", audio] : [];
        const maps = hasAudio ? ["-map", "0:v", "-map", "1:a", "-shortest"] : [];
        await run("ffmpeg", [
          "-y",
          "-i",
          inter,
          ...audioIn,
          ...maps,
          "-c:v",
          "libx264",
          "-preset",
          "slow",
          "-crf",
          mode === "square" ? "25" : "24",
          "-profile:v",
          "high",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k"] : []),
          `${base}.mp4`,
        ]);
        await run("ffmpeg", [
          "-y",
          "-i",
          inter,
          ...audioIn,
          ...maps,
          "-c:v",
          "libvpx-vp9",
          "-crf",
          "37",
          "-b:v",
          "0",
          "-row-mt",
          "1",
          "-deadline",
          "good",
          "-cpu-used",
          "2",
          ...(hasAudio ? ["-c:a", "libopus", "-b:a", "96k"] : []),
          `${base}.webm`,
        ]);
        await run("ffmpeg", [
          "-y",
          "-ss",
          String(cues.poster),
          "-i",
          inter,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          `${base}-poster.jpg`,
        ]);
        console.log(
          `[${tag}] wrote ${base}.mp4 / .webm / -poster.jpg${hasAudio ? "" : " (no soundtrack found)"}`,
        );

        if (flag("publish")) {
          await mkdir(publishDir, { recursive: true });
          for (const ext of [".mp4", ".webm", "-poster.jpg"]) {
            await copyFile(`${base}${ext}`, path.join(publishDir, `${name}${ext}`));
          }
          console.log(`[${tag}] published to ${publishDir}`);
        }
      }
  } finally {
    await browser.close();
    server.close();
  }
}

await main();
