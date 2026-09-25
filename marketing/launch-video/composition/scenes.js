// Launch video composition. Builds every scene into #stage and one paused
// GSAP master timeline. The renderer calls window.__video.seek(t) for each
// frame, so everything here must be a pure function of time: no real
// clocks, no randomness outside the seeded PRNG, no work in callbacks.
import * as art from "./art.js";

/* global gsap, SplitText, DrawSVGPlugin, MotionPathPlugin */
gsap.registerPlugin(SplitText, DrawSVGPlugin, MotionPathPlugin);

const params = new URLSearchParams(location.search);
const MODE = params.get("mode") === "square" ? "square" : "landscape";
const SQ = MODE === "square";
document.body.classList.add(MODE);

const cues = await (await fetch("/cues.json")).json();
const FPS = cues.fps;
const DURATION = cues.duration;
const URL_TEXT = cues.url;
const rand = art.mulberry32(20260925);
const rr = (a, b) => a + rand() * (b - a);

const ICON_NAMES = [
  "truck",
  "map-pin",
  "lock",
  "shield-check",
  "sparkles",
  "arrow-right",
  "check",
  "refresh-cw",
  "lock-keyhole",
];
const ICONS = Object.fromEntries(
  await Promise.all(
    ICON_NAMES.map(async (n) => {
      const res = await fetch(`/node_modules/lucide-static/icons/${n}.svg`);
      const svg = (await res.text())
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\s(width|height)="24"/g, "")
        .trim();
      return [n, svg];
    }),
  ),
);
const QR = await (await fetch("./generated/qr.svg")).text();
let PHOTOS = {};
try {
  const res = await fetch("/assets/photos/manifest.json");
  if (res.ok) PHOTOS = await res.json();
} catch {
  PHOTOS = {};
}

const stage = document.getElementById("stage");
const scenesRoot = document.getElementById("scenes");
const fx = document.getElementById("fx");
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function add(html, root = scenesRoot) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  const node = t.content.firstElementChild;
  root.appendChild(node);
  return node;
}
const icon = (n) => ICONS[n];
const words = (text) =>
  text
    .split(" ")
    .map((w) => `<span class="mask"><span class="w">${w}</span></span>`)
    .join(" ");
const kicker = (label) =>
  `<div class="kicker"><span class="kicker-line"></span><span class="kt">${label}</span></div>`;

/* ------------------------------------------------------------------ */
/* Build scenes                                                        */
/* ------------------------------------------------------------------ */

const S = {};

S.open = add(
  `<section class="scene s-open"><h1>${
    SQ
      ? `${words("When did you")}<br>${words("last sharpen")}<br>${words("your")} <span class="mask"><span class="w serif">knives?</span></span>`
      : `${words("When did you last")}<br>${words("sharpen your")} <span class="mask"><span class="w serif">knives?</span></span>`
  }</h1></section>`,
);

const juice = Array.from({ length: 12 }, () => `<span class="juice"></span>`).join("");
S.problem = add(`<section class="scene s-problem"><div class="wrap">
  <div class="problem-art">
    <div class="board">${art.board("pb")}</div>
    <div class="tomato">${art.tomato("pt")}</div>
    ${juice}
    <div class="knife">${art.knife("pk", { dull: true })}</div>
  </div>
  <div class="problem-lines">
    <div class="line"><span class="mask"><span>Dull knives <span class="hot">crush.</span></span></span></div>
    <div class="line"><span class="mask"><span>They slip.</span></span></div>
    <div class="line"><span class="mask"><span>Cooking feels like work.</span></span></div>
  </div>
</div></section>`);

S.reveal = add(`<section class="scene s-reveal"><div class="center">
  <div class="logo-wrap"><div class="shock"></div><div class="shock s2"></div>${art.logoTile("lg")}</div>
  <div class="wordmark">Westfield Knife Care</div>
  <div class="tagline">${words("Sharpening,")} <span class="mask"><span class="w serif">handled.</span></span></div>
  <div class="reveal-chips">
    <span class="chip">${icon("map-pin")}Local pickup</span>
    <span class="chip">${icon("sparkles")}Pro sharpening</span>
    <span class="chip">${icon("truck")}Fast return</span>
  </div>
</div></section>`);

S.book = add(`<section class="scene s-book"><div class="step">
  <div class="step-copy">
    ${kicker("How it works")}
    <div class="step-num"><span class="mask"><span class="w">01</span></span></div>
    <h2 class="step-title">${words("Book in about")}<br>${words("a minute.")}</h2>
  </div>
  <div class="step-art" style="perspective:1800px">
    <div class="browser">
      <div class="bar">
        <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
        <div class="url">${icon("lock-keyhole")}<span class="url-text"></span></div>
      </div>
      <div class="bk">
        <div class="bk-title">Book a pickup</div>
        <div class="bk-row"><span class="bk-label">How many knives?</span>
          <div class="stepper"><span class="st-btn minus">–</span><span class="st-val">1</span><span class="st-btn plus">+</span></div></div>
        <div class="bk-row"><span class="bk-label">Pickup day</span>
          <div class="days"><span class="day">Tue</span><span class="day">Thu</span><span class="day sat">Sat</span></div></div>
        <div class="bk-input"><span class="placeholder">Street address</span><span class="typed"></span><span class="caret"></span></div>
        <div class="bk-btn"><span class="fill"></span><span class="lbl">Book pickup ${icon("arrow-right")}</span><span class="done">${icon("check")} Booked</span></div>
      </div>
    </div>
  </div>
</div></section>`);

const doorSvg = art.doorScene("dr").replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ');
S.pickup = add(`<section class="scene s-pickup"><div class="step">
  <div class="step-copy">
    ${kicker("How it works")}
    <div class="step-num"><span class="mask"><span class="w">02</span></span></div>
    <h2 class="step-title">${words("We pick up")}<br>${words("at your door.")}</h2>
    <span class="chip loc-chip">${icon("map-pin")}Westfield, NJ</span>
  </div>
  <div class="step-art">
    <div class="door-frame" data-photo="pickup">
      <div class="photo"><img alt=""></div>
      <div class="vector">${doorSvg}<div class="van">${art.van("vn")}</div></div>
      <span class="chip light pick-chip">${icon("check")}Picked up</span>
    </div>
  </div>
</div></section>`);

const sparks = Array.from({ length: 32 }, () => `<span class="spark"></span>`).join("");
S.sharpen = add(`<section class="scene s-sharpen"><div class="step">
  <div class="step-copy">
    ${kicker("How it works")}
    <div class="step-num"><span class="mask"><span class="w">03</span></span></div>
    <h2 class="step-title">${words("Professionally")}<br>${words("sharpened.")}</h2>
    <div class="step-sub">By hand or precision equipment.</div>
  </div>
  <div class="step-art sharpen-art" data-photo="sharpen">
    <div class="photo"><img alt=""></div>
    <div class="vector" style="position:absolute;inset:0">
      <div class="stone">${art.whetstone("ws")}</div>
      <div class="knife">${art.knife("sk")}</div>
      ${sparks}
    </div>
  </div>
</div></section>`);

const slices = Array.from(
  { length: 5 },
  (_, i) => `<div class="slice">${art.tomatoSlice(`sl${i}`)}</div>`,
).join("");
S.ret = add(`<section class="scene s-return"><div class="step">
  <div class="step-copy">
    ${kicker("How it works")}
    <div class="step-num"><span class="mask"><span class="w">04</span></span></div>
    <h2 class="step-title">${words("Back at")}<br>${words("your door.")}<br><span class="mask"><span class="w serif">Sharp.</span></span></h2>
  </div>
  <div class="step-art slice-art" data-photo="slice">
    <div class="photo"><img alt=""></div>
    <div class="vector" style="position:absolute;inset:0">
      <div class="board">${art.board("rb")}</div>
      <div class="tomato">${art.tomato("rt")}</div>
      <div class="slices">${slices}</div>
      <div class="knife">${art.knife("rk")}</div>
    </div>
  </div>
</div></section>`);

const mapSvg = art
  .routeMap("mp", art.mulberry32(7))
  .replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ');
S.details = add(`<section class="scene s-details">
  <h2 class="details-title">${words("The details,")} <span class="mask"><span class="w serif">handled.</span></span></h2>
  <div class="bento">
    <div class="card map" data-photo="local">
      <div class="photo"><img alt=""></div>
      <div class="vector" style="position:absolute;inset:0">${mapSvg}</div>
      <span class="chip light caption">${icon("map-pin")}One local route. No shipping.</span>
    </div>
    <div class="card"><div class="ico">${icon("truck")}</div><h3>Pickup &amp; return included</h3><p>From your door, back to your door.</p></div>
    <div class="card"><div class="ico">${icon("lock")}</div><h3>Secure checkout</h3><p>Card payments through Stripe.</p></div>
    <div class="card"><div class="ico">${icon("sparkles")}</div><h3>Pro sharpening</h3><p>By hand or precision equipment.</p></div>
    <div class="card"><div class="ico">${icon("shield-check")}</div><h3>Full refund</h3><p>If we can't make your pickup.</p></div>
  </div>
</section>`);

S.always = add(`<section class="scene s-always"><div class="center">
  <div class="soon">Coming soon</div>
  <div class="always-title"><span class="mask"><span class="w serif">Always</span></span> <span class="mask"><span class="w">Sharp</span></span></div>
  <div class="always-sub">Swap a dull knife for a sharp one.<br>On repeat.</div>
  <div class="swap">
    <div class="knife k-dull">${art.knife("ad", { dull: true })}</div>
    <div class="arrows">${icon("refresh-cw")}</div>
    <div class="knife k-sharp">${art.knife("as")}</div>
  </div>
  <span class="chip waitlist">${icon("arrow-right")}Join the pilot waitlist</span>
</div></section>`);

S.cta = add(`<section class="scene s-cta"><div class="cta-wrap">
  <div class="cta-brand"><div class="logo-mini">${art.logoTile("lm")}</div><div class="name">Westfield Knife Care</div></div>
  <div class="cta-head">
    <div><span class="mask"><span class="w">Sharp knives.</span></span></div>
    <div><span class="mask"><span class="w serif">Zero hassle.</span></span></div>
  </div>
  <div class="cta-row btn-row"><div class="cta-btn">Book your pickup ${icon("arrow-right")}</div></div>
  <div class="cta-url"><span class="typed"></span></div>
  <div class="cta-row qr-row"><div class="qr-card"><div class="qr">${QR}</div><div class="label">Scan to book a pickup</div></div></div>
</div></section>`);

const cursorEl = add(`<div id="cursor">${art.cursor()}</div>`, fx);

// Photo slots: only active once assets/photos/manifest.json lists files.
for (const slot of $$("[data-photo]")) {
  const file = PHOTOS[slot.dataset.photo];
  if (!file) continue;
  slot.classList.add("has-photo");
  $("img", slot).src = `/assets/photos/${file}`;
}

/* ------------------------------------------------------------------ */
/* Wait for fonts and images, then measure                             */
/* ------------------------------------------------------------------ */

await document.fonts.load('800 100px "Inter Variable"');
await document.fonts.load('400 100px "Instrument Serif"');
await document.fonts.ready;
await Promise.all(
  $$("img")
    .filter((img) => img.getAttribute("src"))
    .map((img) => img.decode().catch(() => {})),
);

const stageBox = stage.getBoundingClientRect();
function point(el, fx = 0.5, fy = 0.5) {
  const r = el.getBoundingClientRect();
  return { x: r.left - stageBox.left + r.width * fx, y: r.top - stageBox.top + r.height * fy };
}
// All scenes are laid out (visibility: hidden still has boxes), so we can
// measure final positions before any animation state is applied.
const P = {
  plus: point($(".st-btn.plus", S.book)),
  sat: point($(".day.sat", S.book)),
  input: point($(".bk-input", S.book), 0.3, 0.5),
  bookBtn: point($(".bk-btn", S.book), 0.55, 0.5),
  ctaBtn: point($(".cta-btn", S.cta), 0.62, 0.55),
};
const W = stageBox.width;
const H = stageBox.height;
const rect = (el) => el.getBoundingClientRect();
// Geometry for contact points (knife edge on tomato/stone), in stage px.
// Knife SVG edge sits at y≈142/200 of its box; tomato body top at 90/380.
const M = {
  pTomato: rect($(".problem-art .tomato", S.problem)),
  pKnife: rect($(".problem-art .knife", S.problem)),
  sStone: rect($(".sharpen-art .stone svg", S.sharpen)),
  sKnife: rect($(".sharpen-art .knife", S.sharpen)),
  sArt: rect($(".sharpen-art", S.sharpen)),
  rTomato: rect($(".slice-art .tomato", S.ret)),
  rKnife: rect($(".slice-art .knife", S.ret)),
  rArt: rect($(".slice-art", S.ret)),
  swap: rect($(".swap", S.always)),
  swapKnife: rect($(".swap .k-dull", S.always)),
};
const knifeEdge = (r) => r.top + r.height * 0.71;

/* ------------------------------------------------------------------ */
/* Timeline helpers                                                    */
/* ------------------------------------------------------------------ */

const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
const updaters = [];

function scene(el, start, end) {
  tl.set(el, { autoAlpha: 1 }, start);
  tl.set(el, { autoAlpha: 0 }, end);
}
function revealWords(targets, t, { stagger = 0.07, dur = 0.75 } = {}) {
  tl.fromTo(
    targets,
    { yPercent: 115, filter: "blur(10px)" },
    { yPercent: 0, filter: "blur(0px)", duration: dur, stagger, ease: "expo.out" },
    t,
  );
}
function zoomIn(el, t, dur = 0.6) {
  tl.fromTo(
    el,
    { scale: 0.93, autoAlpha: 0, filter: "blur(16px)" },
    { scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: dur, ease: "expo.out" },
    t,
  );
}
function zoomOut(el, t, dur = 0.45) {
  tl.to(
    el,
    {
      scale: 1.07,
      autoAlpha: 0,
      filter: "blur(16px)",
      duration: dur,
      ease: "power2.in",
      immediateRender: false,
    },
    t,
  );
}
function pop(el, t, { from = 0.6, ease = "back.out(2.2)", dur = 0.55 } = {}) {
  tl.fromTo(el, { scale: from, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: dur, ease }, t);
}
function typer(el, text, t0, t1) {
  updaters.push((t) => {
    const n =
      t <= t0 ? 0 : t >= t1 ? text.length : Math.round(((t - t0) / (t1 - t0)) * text.length);
    el.textContent = text.slice(0, n);
  });
}
function click(t, p) {
  const ring = add(`<span class="ripple"></span>`, fx);
  gsap.set(ring, { left: p.x, top: p.y, autoAlpha: 0 });
  tl.fromTo(
    ring,
    { scale: 0.2, autoAlpha: 0.95 },
    { scale: 1.6, autoAlpha: 0, duration: 0.55, ease: "power2.out", immediateRender: false },
    t,
  );
  tl.to(cursorEl, { scale: 0.82, duration: 0.08, ease: "power2.out" }, t - 0.04);
  tl.to(cursorEl, { scale: 1, duration: 0.22, ease: "back.out(3)" }, t + 0.06);
}
function moveCursor(p, t0, t1, ease = "power3.inOut") {
  // Offset so the pointer's tip, not its box corner, lands on the point.
  tl.to(cursorEl, { x: p.x - 4, y: p.y - 3, duration: t1 - t0, ease }, t0);
}
function stepCopyIn(sceneEl, t) {
  const copy = $(".step-copy", sceneEl);
  tl.fromTo(
    $(".kicker-line", copy),
    { scaleX: 0 },
    { scaleX: 1, duration: 0.6, ease: "expo.out" },
    t,
  );
  tl.fromTo(
    $(".kt", copy),
    { autoAlpha: 0, x: -20 },
    { autoAlpha: 1, x: 0, duration: 0.5 },
    t + 0.05,
  );
  revealWords($$(".step-num .w", copy), t + 0.05, { dur: 0.8 });
  revealWords($$(".step-title .w", copy), t + 0.15, { stagger: 0.055 });
  const sub = $(".step-sub", copy);
  if (sub) tl.fromTo(sub, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6 }, t + 0.6);
}
function glint(svgRoot, t, dur = 0.6) {
  const g = $(".glint", svgRoot);
  tl.set(g, { opacity: 1 }, t);
  tl.fromTo(
    g,
    { attr: { x: -260 } },
    { attr: { x: 1150 }, duration: dur, ease: "power2.inOut" },
    t,
  );
  tl.set(g, { opacity: 0 }, t + dur);
}

/* ------------------------------------------------------------------ */
/* Global layers                                                       */
/* ------------------------------------------------------------------ */

const g1 = $("#bg .g1");
const g2 = $("#bg .g2");
gsap.set(g1, { x: -W * 0.2, y: -H * 0.15 });
gsap.set(g2, { x: W * 0.25, y: H * 0.2 });
tl.to(
  g1,
  {
    keyframes: [
      { x: W * 0.18, y: H * 0.05 },
      { x: -W * 0.1, y: H * 0.2 },
      { x: -W * 0.2, y: -H * 0.15 },
    ],
    duration: DURATION,
    ease: "sine.inOut",
  },
  0,
);
tl.to(
  g2,
  {
    keyframes: [
      { x: -W * 0.2, y: -H * 0.1 },
      { x: W * 0.1, y: -H * 0.2 },
      { x: W * 0.25, y: H * 0.2 },
    ],
    duration: DURATION,
    ease: "sine.inOut",
  },
  0,
);

const grid = $("#bg .grid");
const grain = $("#grain");
grain.style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;
// Grain stays still: per-frame noise is incompressible and would roughly
// double the file size of a homepage video for a barely visible effect.
updaters.push((t) => {
  grid.style.backgroundPosition = `${(t * 6).toFixed(2)}px ${(t * 14).toFixed(2)}px`;
});

const flash = $("#flash");
const blackout = $("#blackout");
function impact(t, strength = 0.55) {
  tl.fromTo(
    flash,
    { opacity: strength },
    { opacity: 0, duration: 0.45, ease: "power2.out", immediateRender: false },
    t,
  );
  tl.fromTo(
    g1,
    { scale: 1.35, opacity: 1 },
    { scale: 1, duration: 1.6, ease: "expo.out", immediateRender: false },
    t,
  );
}

/* ------------------------------------------------------------------ */
/* S1 — cold open (0–4)                                                */
/* ------------------------------------------------------------------ */
{
  const s = S.open;
  scene(s, 0, 4.0);
  const ws = $$(".w", s);
  const times = SQ
    ? [0.25, 0.4, 0.55, 1.0, 1.15, 1.75, 1.9]
    : [0.25, 0.4, 0.55, 0.7, 1.0, 1.15, 1.75];
  ws.forEach((w, i) => revealWords([w], times[i] ?? 1.9, { dur: 0.7 }));
  const h1 = $("h1", s);
  tl.fromTo(h1, { scale: 1 }, { scale: 1.05, duration: 3.3, ease: "sine.inOut" }, 0.2);
  zoomOut(h1, 3.52);
}

/* ------------------------------------------------------------------ */
/* S2 — the problem (4–8)                                              */
/* ------------------------------------------------------------------ */
{
  const s = S.problem;
  scene(s, 3.95, 7.72);
  const wrap = $(".wrap", s);
  const artBox = $(".problem-art", s);
  const knifeEl = $(".knife", s);
  const tomatoEl = $(".tomato", s);
  const lines = $$(".line", s);
  zoomIn(artBox, 3.95);
  const th = M.pTomato.height;
  const tomatoTop = M.pTomato.top + th * (90 / 380);
  const origin = M.pTomato.top + th * 0.92;
  const squishedTop = origin - (origin - tomatoTop) * 0.62;
  const yContact = tomatoTop - knifeEdge(M.pKnife);
  const yPress = squishedTop - knifeEdge(M.pKnife) + 6;
  tl.fromTo(
    knifeEl,
    { y: yContact - 260, rotation: -9 },
    { y: yContact, rotation: -2, duration: 0.42, ease: "power2.in" },
    4.03,
  );
  tl.to(knifeEl, { y: yPress, rotation: 0, duration: 0.3, ease: "power2.out" }, 4.45);
  tl.to(
    tomatoEl,
    { scaleY: 0.62, scaleX: 1.26, duration: 0.5, ease: "elastic.out(1, 0.45)" },
    4.45,
  );
  // Dull sawing: back and forth, tomato wobbles, nothing gets cut.
  tl.to(
    knifeEl,
    { keyframes: [{ x: 50 }, { x: -40 }, { x: 45 }, { x: 0 }], duration: 0.8, ease: "sine.inOut" },
    4.6,
  );
  tl.to(
    tomatoEl,
    {
      keyframes: [{ scaleX: 1.32 }, { scaleX: 1.22 }, { scaleX: 1.3 }, { scaleX: 1.26 }],
      duration: 0.8,
      ease: "sine.inOut",
    },
    4.6,
  );
  $$(".juice", s).forEach((d, i) => {
    const dx = rr(-280, 280);
    const up = rr(80, 240);
    const t = 4.45 + i * 0.008;
    tl.set(d, { autoAlpha: 1, scale: rr(0.5, 1.3) }, t);
    tl.fromTo(d, { x: 0, y: 0 }, { x: dx * 0.6, y: -up, duration: 0.28, ease: "power2.out" }, t);
    tl.to(d, { x: dx, y: rr(60, 140), duration: 0.42, ease: "power2.in" }, t + 0.28);
    tl.to(d, { autoAlpha: 0, duration: 0.2 }, t + 0.62);
  });
  // "They slip."
  tl.to(knifeEl, { x: 95, y: yPress + 60, rotation: 18, duration: 0.22, ease: "power3.in" }, 5.45);
  tl.to(knifeEl, { x: 105, y: yPress + 68, rotation: 15, duration: 0.5, ease: "power2.out" }, 5.67);
  lines.forEach((line, i) => {
    const t = [4.5, 5.5, 6.5][i];
    revealWords([$(".mask > span", line)], t, { dur: 0.7 });
    if (i < 2) tl.to(line, { opacity: 0.32, duration: 0.4 }, t + 1.0);
  });
  tl.to(artBox, { opacity: 0.5, duration: 0.6 }, 6.5);
  // Riser: push in, then hard cut to black before the drop.
  tl.to(wrap, { scale: 1.1, duration: 1.72, ease: "power2.in" }, 6.0);
  tl.set(blackout, { opacity: 1 }, 7.72);
  tl.set(blackout, { opacity: 0 }, 8.0);
}

/* ------------------------------------------------------------------ */
/* S3 — brand reveal (8–12)                                            */
/* ------------------------------------------------------------------ */
{
  const s = S.reveal;
  scene(s, 7.99, 12.05);
  impact(8.0, 0.7);
  const logo = $(".logo-wrap svg", s);
  tl.fromTo(
    logo,
    { scale: 0.15, rotation: -30 },
    { scale: 1, rotation: 0, duration: 0.95, ease: "back.out(2.4)" },
    8.0,
  );
  $$(".shock", s).forEach((ring, i) => {
    tl.fromTo(
      ring,
      { scale: 0.6, autoAlpha: 0.9 },
      { scale: 9 + i * 3, autoAlpha: 0, duration: 1.0 + i * 0.2, ease: "power2.out" },
      8.0 + i * 0.1,
    );
  });
  const sheen = $(".sheen", logo);
  tl.fromTo(
    sheen,
    { attr: { x: -220 } },
    { attr: { x: 420 }, duration: 0.7, ease: "power2.inOut" },
    8.35,
  );
  const split = SplitText.create($(".wordmark", s), { type: "chars,words", mask: "words" });
  tl.fromTo(
    split.chars,
    { yPercent: 110, autoAlpha: 0 },
    { yPercent: 0, autoAlpha: 1, duration: 0.8, stagger: 0.022, ease: "expo.out" },
    8.45,
  );
  revealWords($$(".tagline .w", s), 9.5, { stagger: 0.12 });
  $$(".reveal-chips .chip", s).forEach((c, i) => pop(c, 10.5 + i * 0.25));
  zoomOut($(".center", s), 11.7);
}

/* ------------------------------------------------------------------ */
/* S4 — 01 book (12–18)                                                */
/* ------------------------------------------------------------------ */
{
  const s = S.book;
  scene(s, 11.95, 18.0);
  stepCopyIn(s, 12.0);
  const browser = $(".browser", s);
  tl.fromTo(
    browser,
    { y: 300, rotationX: 30, scale: 0.88, autoAlpha: 0 },
    { y: 0, rotationX: 0, scale: 1, autoAlpha: 1, duration: 1.0, ease: "expo.out" },
    12.45,
  );
  typer($(".url-text", s), URL_TEXT, 12.6, 13.1);

  const val = $(".st-val", s);
  updaters.push((t) => {
    val.textContent = t < 13.0 ? "1" : t < 13.5 ? "2" : "3";
  });
  tl.fromTo(
    val,
    { scale: 1.35 },
    { scale: 1, duration: 0.3, ease: "back.out(3)", immediateRender: false },
    13.0,
  );
  tl.fromTo(
    val,
    { scale: 1.35 },
    { scale: 1, duration: 0.3, ease: "back.out(3)", immediateRender: false },
    13.5,
  );
  const plus = $(".st-btn.plus", s);
  [13.0, 13.5].forEach((t) =>
    tl.fromTo(
      plus,
      { scale: 0.86 },
      { scale: 1, duration: 0.25, ease: "back.out(3)", immediateRender: false },
      t,
    ),
  );

  const sat = $(".day.sat", s);
  tl.to(
    sat,
    { backgroundColor: "#1f4d34", color: "#ffffff", duration: 0.18, ease: "power1.out" },
    14.25,
  );
  tl.fromTo(
    sat,
    { scale: 0.9 },
    { scale: 1, duration: 0.3, ease: "back.out(3)", immediateRender: false },
    14.25,
  );

  const input = $(".bk-input", s);
  tl.to(
    input,
    { borderColor: "#2c6b48", boxShadow: "0 0 0 6px rgba(156,204,110,0.35)", duration: 0.2 },
    14.6,
  );
  tl.to($(".placeholder", s), { autoAlpha: 0, duration: 0.1 }, 14.75);
  typer($(".typed", input), "12 Elm St, Westfield", 14.75, 15.75);
  const caret = $(".caret", s);
  updaters.push((t) => {
    const focused = t >= 14.6 && t < 16.4;
    const typing = t >= 14.75 && t <= 15.75;
    caret.style.opacity = focused && (typing || Math.floor(t * 2.4) % 2 === 0) ? "1" : "0";
  });

  const btn = $(".bk-btn", s);
  tl.fromTo(
    $(".fill", btn),
    { scaleX: 0 },
    { scaleX: 1, duration: 0.32, ease: "power3.inOut" },
    16.5,
  );
  tl.to($(".lbl", btn), { autoAlpha: 0, y: -24, duration: 0.2 }, 16.52);
  tl.fromTo(
    $(".done", btn),
    { autoAlpha: 0, y: 24 },
    { autoAlpha: 1, y: 0, duration: 0.35, ease: "back.out(2)" },
    16.68,
  );
  tl.fromTo(
    btn,
    { scale: 0.96 },
    { scale: 1, duration: 0.35, ease: "back.out(3)", immediateRender: false },
    16.5,
  );

  // Confetti from the button.
  const colors = ["#9ccc6e", "#caeea3", "#ffffff", "#1f4d34", "#f3f0e6"];
  for (let i = 0; i < 26; i++) {
    const c = add(`<span class="confetti"></span>`, fx);
    gsap.set(c, { left: P.bookBtn.x, top: P.bookBtn.y, background: colors[i % colors.length] });
    const ang = rr(-Math.PI * 0.95, -Math.PI * 0.05);
    const dist = rr(160, 420);
    const t = 16.75 + rr(0, 0.05);
    tl.set(c, { autoAlpha: 1 }, t);
    tl.fromTo(
      c,
      { x: 0, y: 0, rotation: 0 },
      {
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        rotation: rr(-360, 360),
        duration: 0.5,
        ease: "power3.out",
      },
      t,
    );
    tl.to(
      c,
      {
        y: `+=${rr(160, 280)}`,
        rotation: `+=${rr(-180, 180)}`,
        autoAlpha: 0,
        duration: 0.7,
        ease: "power2.in",
      },
      t + 0.5,
    );
  }

  // Cursor path.
  tl.set(cursorEl, { x: W + 80, y: H * 0.85, autoAlpha: 1, scale: 1 }, 12.7);
  moveCursor(P.plus, 12.7, 12.98, "power3.out");
  click(13.0, P.plus);
  click(13.5, P.plus);
  moveCursor(P.sat, 13.62, 14.2);
  click(14.25, P.sat);
  moveCursor(P.input, 14.3, 14.56);
  click(14.6, P.input);
  moveCursor(P.bookBtn, 15.85, 16.45);
  click(16.5, P.bookBtn);
  tl.to(cursorEl, { autoAlpha: 0, duration: 0.3 }, 17.2);

  zoomOut($(".step", s), 17.5);
}

/* ------------------------------------------------------------------ */
/* S5 — 02 pickup (18–22)                                              */
/* ------------------------------------------------------------------ */
{
  const s = S.pickup;
  scene(s, 17.95, 22.0);
  stepCopyIn(s, 18.0);
  pop($(".loc-chip", s), 18.7, { from: 0.8 });
  const frame = $(".door-frame", s);
  zoomIn(frame, 18.05, 0.7);

  const vanEl = $(".van", s);
  const wheels = $$(".wheel", vanEl);
  tl.fromTo(vanEl, { xPercent: 130 }, { xPercent: 0, duration: 0.95, ease: "power3.out" }, 18.5);
  tl.fromTo(
    wheels,
    { rotation: 0 },
    { rotation: -540, duration: 0.95, ease: "power3.out", transformOrigin: "50% 50%" },
    18.5,
  );
  tl.to(
    vanEl,
    {
      keyframes: [
        { y: -8, rotation: -1 },
        { y: 0, rotation: 0 },
      ],
      duration: 0.35,
      ease: "sine.inOut",
    },
    19.4,
  );

  const chip = $(".pick-chip", s);
  gsap.set(chip, { xPercent: -50 });
  pop(chip, 19.75);
  const bag = $(".bag", s);
  tl.to(
    bag,
    {
      x: 230,
      y: -40,
      scale: 0.55,
      autoAlpha: 0,
      duration: 0.45,
      ease: "power2.in",
      transformOrigin: "50% 50%",
    },
    20.5,
  );
  tl.to(chip, { autoAlpha: 0, y: -20, duration: 0.3 }, 21.0);
  tl.to(vanEl, { xPercent: -170, duration: 0.7, ease: "power2.in" }, 21.0);
  tl.to(wheels, { rotation: -1200, duration: 0.7, ease: "power2.in" }, 21.0);

  zoomOut($(".step", s), 21.5);
}

/* ------------------------------------------------------------------ */
/* S6 — 03 sharpen (22–26)                                             */
/* ------------------------------------------------------------------ */
{
  const s = S.sharpen;
  scene(s, 21.95, 26.0);
  stepCopyIn(s, 22.0);
  const artBox = $(".sharpen-art", s);
  zoomIn(artBox, 22.05, 0.7);
  const knifeEl = $(".sharpen-art .knife", s);
  const dx = SQ ? 90 : 120;
  const stoneTop = M.sStone.top + M.sStone.height * (214 / 420);
  const y0 = stoneTop - knifeEdge(M.sKnife);
  gsap.set(knifeEl, { x: -dx, y: y0, rotation: 2 });
  const strokes = [22.5, 23.0, 23.5, 24.0];
  strokes.forEach((t, i) => {
    const to = i === 3 ? 0 : i % 2 === 0 ? dx : -dx;
    tl.to(knifeEl, { x: to, y: y0 + (i % 2 ? 2 : -2), duration: 0.46, ease: "sine.inOut" }, t);
  });
  // Sparks where the edge meets the stone, in the art box's local space.
  const sparkEls = $$(".spark", s);
  strokes.forEach((t, si) => {
    for (let k = 0; k < 8; k++) {
      const sp = sparkEls[si * 8 + k];
      const ang = rr(-170, -10);
      const dist = rr(70, 190);
      const cx = M.sStone.left - M.sArt.left + M.sStone.width * (0.5 + (si % 2 ? -0.14 : 0.14));
      const cy = stoneTop - M.sArt.top;
      gsap.set(sp, { left: cx, top: cy, rotation: ang });
      const tt = t + 0.12 + k * 0.012;
      tl.fromTo(
        sp,
        { autoAlpha: 1, x: 0, y: 0, scaleX: 0.3 },
        {
          x: Math.cos((ang * Math.PI) / 180) * dist,
          y: Math.sin((ang * Math.PI) / 180) * dist,
          scaleX: 1,
          autoAlpha: 0,
          duration: 0.42,
          ease: "power2.out",
        },
        tt,
      );
    }
  });
  tl.to(
    knifeEl,
    { y: y0 - 190, rotation: -5, scale: 1.05, duration: 0.5, ease: "expo.out" },
    24.45,
  );
  const ksvg = $("svg", knifeEl);
  glint(ksvg, 24.55, 0.6);
  const flare = $(".tip-flare", ksvg);
  tl.fromTo(
    flare,
    { scale: 0, rotation: 0, opacity: 1, transformOrigin: "50% 50%" },
    { scale: 1.3, rotation: 90, duration: 0.3, ease: "power2.out" },
    24.9,
  );
  tl.to(flare, { scale: 0, opacity: 0, duration: 0.3, ease: "power2.in" }, 25.2);
  zoomOut($(".step", s), 25.5);
}

/* ------------------------------------------------------------------ */
/* S7 — 04 return (26–30)                                              */
/* ------------------------------------------------------------------ */
{
  const s = S.ret;
  scene(s, 25.95, 30.1);
  stepCopyIn(s, 26.0);
  const artBox = $(".slice-art", s);
  zoomIn(artBox, 26.05, 0.6);
  const knifeEl = $(".slice-art .knife", s);
  const tomatoEl = $(".slice-art .tomato", s);
  const rth = M.rTomato.height;
  const yHover = M.rTomato.top + rth * (90 / 380) - 40 - knifeEdge(M.rKnife);
  const yCut = M.rTomato.top + rth * 0.93 - knifeEdge(M.rKnife);
  tl.fromTo(
    knifeEl,
    { x: 160, y: yHover - 180, rotation: -16, autoAlpha: 0 },
    { x: 40, y: yHover, rotation: -8, autoAlpha: 1, duration: 0.4, ease: "power3.out" },
    26.05,
  );
  tl.to(knifeEl, { x: -10, y: yCut, rotation: -1, duration: 0.14, ease: "power4.in" }, 26.5);
  tl.set(tomatoEl, { autoAlpha: 0 }, 26.64);
  const sl = $$(".slice", s);
  const spread = SQ ? 0.13 : 0.12;
  sl.forEach((el, i) => {
    const x = (1.6 - i) * spread * M.rArt.width;
    tl.set(el, { autoAlpha: 1, scaleX: 0.12, x: 0, y: 0, rotation: 0 }, 26.64);
    tl.to(
      el,
      {
        x,
        y: -Math.abs(i - 2) * 6,
        scaleX: 0.94,
        scaleY: 0.9,
        rotation: (i - 2) * 5,
        duration: 0.7,
        ease: "back.out(1.5)",
      },
      26.66 + i * 0.05,
    );
  });
  tl.to(knifeEl, { x: 30, y: yHover - 70, rotation: -6, duration: 0.55, ease: "expo.out" }, 26.8);
  glint($("svg", knifeEl), 27.4, 0.55);
  zoomOut($(".step", s), 29.55);
  // Cream wipe into the light section.
  tl.fromTo(
    "#bg-cream",
    { clipPath: "circle(0% at 50% 55%)" },
    { clipPath: "circle(150% at 50% 55%)", duration: 0.6, ease: "power2.inOut" },
    29.7,
  );
}

/* ------------------------------------------------------------------ */
/* S8 — the details (30–38)                                            */
/* ------------------------------------------------------------------ */
{
  const s = S.details;
  scene(s, 29.95, 38.05);
  revealWords($$(".details-title .w", s), 30.0, { stagger: 0.1 });
  const cards = $$(".card", s);
  cards.forEach((c, i) => {
    tl.fromTo(
      c,
      { y: 70, scale: 0.9, autoAlpha: 0 },
      { y: 0, scale: 1, autoAlpha: 1, duration: 0.75, ease: "back.out(1.5)" },
      30.5 + i * 0.5,
    );
    const ico = $(".ico", c);
    if (ico)
      tl.fromTo(
        ico,
        { rotation: -18, scale: 0.6 },
        { rotation: 0, scale: 1, duration: 0.7, ease: "back.out(3)" },
        30.62 + i * 0.5,
      );
  });
  pop($(".card.map .caption", s), 31.0, { from: 0.8 });
  const bento = $(".bento", s);
  tl.fromTo(bento, { scale: 1 }, { scale: 1.025, duration: 7, ease: "sine.inOut" }, 30.5);

  const route = $(".route", s);
  const routeGlow = $(".route-glow", s);
  tl.fromTo(
    [route, routeGlow],
    { drawSVG: "0%" },
    { drawSVG: "100%", duration: 3.0, ease: "power1.inOut" },
    33.3,
  );
  $$(".pin", s).forEach((pin, i) => {
    tl.fromTo(
      $(".pin-inner", pin),
      { y: -70, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.55, ease: "bounce.out" },
      33.5 + i * 0.5,
    );
  });
  const vanDot = $(".van-dot", s);
  tl.set(vanDot, { autoAlpha: 0 }, 0);
  tl.set(vanDot, { autoAlpha: 1 }, 33.3);
  tl.to(
    vanDot,
    {
      motionPath: { path: route, align: route, alignOrigin: [0.5, 0.5] },
      duration: 3.0,
      ease: "power1.inOut",
    },
    33.3,
  );

  const title = $(".details-title", s);
  tl.to([title, bento], { autoAlpha: 0, y: -40, duration: 0.45, ease: "power2.in" }, 37.45);
  tl.to(
    "#bg-cream",
    { clipPath: "circle(0% at 50% 55%)", duration: 0.55, ease: "power2.inOut" },
    37.5,
  );
}

/* ------------------------------------------------------------------ */
/* S9 — Always Sharp teaser (38–42)                                    */
/* ------------------------------------------------------------------ */
{
  const s = S.always;
  scene(s, 37.95, 42.0);
  pop($(".soon", s), 38.0, { from: 0.7 });
  revealWords($$(".always-title .w", s), 38.5, { stagger: 0.12, dur: 0.85 });
  tl.fromTo(
    $(".always-sub", s),
    { autoAlpha: 0, y: 30 },
    { autoAlpha: 1, y: 0, duration: 0.7 },
    39.1,
  );
  const kd = $(".k-dull", s);
  const ks = $(".k-sharp", s);
  const arrows = $(".arrows", s);
  tl.fromTo(
    [kd, ks, arrows],
    { autoAlpha: 0, y: 40 },
    { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08 },
    38.8,
  );
  const d = M.swap.width - M.swapKnife.width;
  tl.to(
    $("svg", arrows),
    { rotation: 360, duration: 0.85, ease: "power2.inOut", transformOrigin: "50% 50%" },
    39.5,
  );
  tl.to(
    kd,
    {
      keyframes: [
        { x: d / 2, y: -90 },
        { x: d, y: 0 },
      ],
      duration: 0.85,
      ease: "power2.inOut",
    },
    39.5,
  );
  tl.to(
    ks,
    {
      keyframes: [
        { x: -d / 2, y: 90 },
        { x: -d, y: 0 },
      ],
      duration: 0.85,
      ease: "power2.inOut",
    },
    39.5,
  );
  tl.to(kd, { autoAlpha: 0.28, duration: 0.4 }, 40.35);
  glint($("svg", ks), 40.4, 0.55);
  pop($(".waitlist", s), 40.5, { from: 0.8 });
  zoomOut($(".center", s), 41.6, 0.4);
}

/* ------------------------------------------------------------------ */
/* S10 — call to action (42–50)                                        */
/* ------------------------------------------------------------------ */
{
  const s = S.cta;
  scene(s, 41.98, 50.0);
  impact(42.0, 0.55);
  const brand = $(".cta-brand", s);
  pop($(".logo-mini", s), 42.0, { from: 0.3, ease: "back.out(2.6)", dur: 0.7 });
  tl.fromTo(
    $(".cta-brand .name", s),
    { autoAlpha: 0, x: SQ ? 0 : -20 },
    { autoAlpha: 1, x: 0, duration: 0.6 },
    42.15,
  );
  const lines = $$(".cta-head .w", s);
  revealWords([lines[0]], 42.5, { dur: 0.8 });
  revealWords([lines[1]], 43.0, { dur: 0.8 });
  const btn = $(".cta-btn", s);
  pop(btn, 44.0, { from: 0.6, dur: 0.65 });
  tl.set(cursorEl, { x: W + 60, y: H + 40, autoAlpha: 1, scale: 1 }, 44.3);
  moveCursor(P.ctaBtn, 44.3, 44.9, "power3.out");
  tl.to(btn, { scale: 1.04, duration: 0.25, ease: "power2.out" }, 44.75);
  click(45.0, P.ctaBtn);
  tl.to(btn, { scale: 0.96, duration: 0.08 }, 44.98);
  tl.to(btn, { scale: 1, duration: 0.35, ease: "back.out(3)" }, 45.06);
  tl.to(cursorEl, { autoAlpha: 0, y: "+=30", duration: 0.4 }, 45.7);
  typer($(".cta-url .typed", s), URL_TEXT, 45.5, 46.3);
  tl.fromTo(
    $(".qr-card", s),
    { autoAlpha: 0, x: SQ ? 0 : 90, y: SQ ? 60 : 0, rotation: SQ ? 0 : 5 },
    { autoAlpha: 1, x: 0, y: 0, rotation: 0, duration: 0.8, ease: "expo.out" },
    46.0,
  );
  tl.to(
    btn,
    {
      keyframes: [{ scale: 1.025 }, { scale: 1 }, { scale: 1.025 }, { scale: 1 }],
      duration: 2.6,
      ease: "sine.inOut",
    },
    46.5,
  );
  tl.to($(".cta-wrap", s), { autoAlpha: 0, duration: 0.6, ease: "power2.in" }, 49.15);
  void brand;
}

// Slow push on any photo that replaced vector art (Ken Burns).
const PHOTO_WINDOWS = { pickup: [18, 22], sharpen: [22, 26], slice: [26, 30], local: [30, 38] };
for (const slot of $$(".has-photo")) {
  const [a, b] = PHOTO_WINDOWS[slot.dataset.photo] ?? [0, 0];
  tl.fromTo(
    $(".photo img", slot),
    { scale: 1.12 },
    { scale: 1, duration: b - a, ease: "sine.out" },
    a,
  );
}

// Park anything that should not exist before its scene.
tl.set(cursorEl, { autoAlpha: 0 }, 0);

/* ------------------------------------------------------------------ */
/* Public API for the renderer                                         */
/* ------------------------------------------------------------------ */
function seek(t) {
  tl.seek(Math.min(Math.max(t, 0), DURATION));
  for (const u of updaters) u(t);
}
seek(0);
window.__video = { mode: MODE, fps: FPS, duration: DURATION, width: W, height: H, seek };
document.body.dataset.ready = "1";
