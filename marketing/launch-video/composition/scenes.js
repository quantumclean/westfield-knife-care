// Launch film composition: four beats and an end card.
//
//   Dull.            a dull knife drags across a tomato and crushes it
//   Sharp.           a sharp knife falls through it in one stroke
//   Picked up ...    the knife bag leaves the doorstep at night
//   Back ...         and is back on the mat in the morning
//   logo + CTA
//
// Builds every scene into #stage and one paused GSAP master timeline. The
// renderer calls window.__video.seek(t) for each frame, so everything here
// must be a pure function of time: no real clocks, no randomness outside the
// seeded PRNG, no work in callbacks.
//
// ?cut=a|b picks the pickup/return lines, which must match the offer the
// visitor is shown (cues.json "cuts"); visuals are identical across cuts.
import * as art from "./art.js";

/* global gsap, SplitText, DrawSVGPlugin */
gsap.registerPlugin(SplitText, DrawSVGPlugin);

const params = new URLSearchParams(location.search);
const MODE = params.get("mode") === "square" ? "square" : "landscape";
const SQ = MODE === "square";
document.body.classList.add(MODE);

const cues = await (await fetch("/cues.json")).json();
const CUT = cues.cuts[params.get("cut")] ? params.get("cut") : "b";
const COPY = cues.cuts[CUT];
const FPS = cues.fps;
const DURATION = cues.duration;
const rand = art.mulberry32(20260925);
const rr = (a, b) => a + rand() * (b - a);

await document.fonts.load(`760 100px "Inter Variable"`);
await document.fonts.ready;

const stage = document.getElementById("stage");
const scenesRoot = document.getElementById("scenes");
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function add(html, root = scenesRoot) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  const node = t.content.firstElementChild;
  root.appendChild(node);
  return node;
}
/** Big type, one masked line per entry; the second line is the accent. */
const lines = (parts, cls) =>
  `<div class="word lines ${cls}">${parts
    .map((p, i) => `<span class="ln${i ? " accent" : ""}"><span>${p}</span></span>`)
    .join("")}</div>`;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const S = {};
const JUICE = 9;
const SLICES = 5;

S.dull = add(`<section class="scene s-dull">
  <div class="spot"></div>
  <div class="word beat dull">Dull.</div>
  <div class="kitchen dull-art">
    <div class="board">${art.board("db")}</div>
    <div class="tomato">${art.tomato("dt")}</div>
    ${`<span class="juice"></span>`.repeat(JUICE)}
    <div class="knife">${art.knife("dk", { dull: true })}</div>
  </div>
</section>`);

S.sharp = add(`<section class="scene s-sharp">
  <div class="spot"></div>
  <div class="word beat sharp"><span class="ln"><span>Sharp.</span></span></div>
  <svg class="edge" xmlns="http://www.w3.org/2000/svg"></svg>
  <div class="kitchen">
    <div class="board">${art.board("sb")}</div>
    ${Array.from({ length: SLICES }, (_, i) => `<div class="slice">${art.tomatoSlice(`ss${i}`)}</div>`).join("")}
    <div class="tomato">${art.tomato("st")}</div>
    <div class="knife">${art.knife("sk")}</div>
  </div>
</section>`);

S.door = add(`<section class="scene s-door">
  ${lines(COPY.pickup, "t-pick")}
  ${lines(COPY.back, "t-back")}
  <div class="doorway">
    ${art.doorway("dn", "night")}
    ${art.doorway("dm", "morning").replace('class="doorway-svg"', 'class="doorway-svg morning"')}
    <div class="bag">${art.knifeBag("kb")}</div>
    ${`<div class="spark">${art.sparkle()}</div>`.repeat(3)}
  </div>
</section>`);

S.logo = add(`<section class="scene s-logo">
  <div class="glow"></div>
  <div class="end">
    <div class="logo">${art.logoTile("lg")}</div>
    <div class="name">Westfield Knife Care</div>
    <div class="cta">
      <span class="pill">Sharpen My Knives<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
      <span class="url">${cues.url}</span>
    </div>
  </div>
</section>`);

// Grain stays still: per-frame noise is incompressible and would bloat a
// homepage video for a barely visible effect.
$("#grain").style.backgroundImage = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

/* ------------------------------------------------------------------ */
/* Layout fixes and measurements (before any tween moves anything)     */
/* ------------------------------------------------------------------ */

const stageBox = stage.getBoundingClientRect();
const W = stageBox.width;
const H = stageBox.height;
const rect = (el) => {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - stageBox.left,
    top: r.top - stageBox.top,
    width: r.width,
    height: r.height,
  };
};

// Landscape: shrink the doorstep lines if the longest would run into the door.
if (!SQ) {
  const door = rect($(".doorway", S.door));
  for (const el of $$(".word.lines", S.door)) {
    const spans = $$(".ln > span", el);
    const widest = Math.max(...spans.map((s) => s.getBoundingClientRect().width));
    const room = door.left - rect(el).left - 80;
    if (widest > room) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.floor((fs * room) / widest)}px`;
    }
  }
}

// Knife/tomato contact geometry, as knife y-offsets from its resting place.
// Knife SVG (1000x200): the edge's belly sits at y≈144. Tomato SVG
// (400x380): body top ≈ y96 at the stem, body bottom ≈ y352, and the
// squash origin is 92% down the box.
function kitchenGeometry(sceneEl) {
  const k = rect($(".kitchen", sceneEl));
  const t = rect($(".tomato", sceneEl));
  const n = rect($(".knife", sceneEl));
  const edge = n.top + n.height * 0.72;
  return {
    box: k,
    tomato: t,
    contact: t.top + t.height * (96 / 380) - edge,
    board: t.top + t.height * (352 / 380) - edge,
    squash: t.height * ((0.92 * 380 - 96) / 380),
    tomatoCx: t.left - k.left + t.width / 2,
    tomatoTop: t.top - k.top + t.height * (96 / 380),
  };
}
const GD = kitchenGeometry(S.dull);
const GS = kitchenGeometry(S.sharp);

// The light streak under "Sharp."
const sw = rect($(".word.sharp .ln > span", S.sharp));
const edgeSvg = $(".edge", S.sharp);
const edgeW = Math.round(sw.width * 0.94);
Object.assign(edgeSvg.style, {
  left: `${Math.round(sw.left + (sw.width - edgeW) / 2)}px`,
  top: `${Math.round(sw.top + sw.height + (SQ ? 4 : 10))}px`,
  width: `${edgeW}px`,
  height: "8px",
});
edgeSvg.setAttribute("viewBox", `0 0 ${edgeW} 8`);
edgeSvg.innerHTML = `<defs><linearGradient id="edge-g" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.35" stop-color="#ffffff"/>
  <stop offset="0.8" stop-color="#caeea3"/><stop offset="1" stop-color="#9ccc6e" stop-opacity="0"/>
</linearGradient></defs>
<line x1="0" y1="4" x2="${edgeW}" y2="4" stroke="url(#edge-g)" stroke-width="3" stroke-linecap="round"/>`;

// Sparks sit around the bag's handles, in px relative to the doorway. The
// bag is centred with xPercent -50 below, so shift its measured box now.
const doorBox = rect($(".doorway", S.door));
const bagBox = rect($(".doorway .bag", S.door));
bagBox.left -= bagBox.width / 2;
const SPARKS = [
  [0.22, 0.1, 1.0],
  [0.66, -0.02, 0.75],
  [0.86, 0.34, 0.6],
];

/* ------------------------------------------------------------------ */
/* Timeline helpers                                                    */
/* ------------------------------------------------------------------ */

const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
const updaters = [];
// Every fromTo is deferred: the timeline owns the state, never build time.
const fromTo = (el, from, to, t) => tl.fromTo(el, from, { immediateRender: false, ...to }, t);

function show(el, t, fade = 0) {
  if (fade) fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: fade, ease: "power1.out" }, t);
  else tl.set(el, { autoAlpha: 1 }, t);
}
function hide(el, t, fade = 0) {
  if (fade) tl.to(el, { autoAlpha: 0, duration: fade, ease: "power1.in" }, t - fade);
  else tl.set(el, { autoAlpha: 0 }, t);
}
/** Slow camera push across a scene, so nothing is ever perfectly still. */
function push(el, t0, t1, to = 1.035) {
  fromTo(el, { scale: 1 }, { scale: to, duration: t1 - t0, ease: "sine.inOut" }, t0);
}
function knifeGlint(knifeEl, t, dur = 0.6) {
  const g = $(".glint", knifeEl);
  tl.set(g, { opacity: 1 }, t);
  fromTo(g, { attr: { x: -260 } }, { attr: { x: 1150 }, duration: dur, ease: "power2.inOut" }, t);
  tl.set(g, { opacity: 0 }, t + dur);
}
function linesIn(el, t) {
  fromTo(
    $$(".ln > span", el),
    { yPercent: 110 },
    { yPercent: 0, duration: 0.8, stagger: 0.12, ease: "expo.out" },
    t,
  );
}
function linesOut(el, t) {
  tl.to(
    $$(".ln > span", el),
    // Far enough that descenders clear the mask too.
    { yPercent: -150, duration: 0.45, stagger: 0.06, ease: "power2.in" },
    t,
  );
}

gsap.set($$(".scene"), { autoAlpha: 0 });

/* ---------- 1. Dull. (0 – 4.35) ---------- */
{
  const el = S.dull;
  const word = $(".word", el);
  const kitchen = $(".kitchen", el);
  const tomato = $(".tomato", kitchen);
  const knife = $(".knife", kitchen);
  const chars = SplitText.create(word, { type: "chars", mask: "chars" }).chars;
  const G = GD;

  show(el, 0);
  push(el, 0, 4.35, 1.03);
  fromTo($(".spot", el), { opacity: 0 }, { opacity: 1, duration: 1, ease: "power1.out" }, 0.2);
  fromTo(
    kitchen,
    { autoAlpha: 0, y: 40 },
    { autoAlpha: 1, y: 0, duration: 1, ease: "power2.out" },
    0.3,
  );
  // Letters arrive slowly and unevenly: nothing about dull is crisp.
  gsap.set(chars, { yPercent: 100 });
  fromTo(
    chars,
    { yPercent: 100 },
    { yPercent: 0, duration: 1.1, stagger: 0.14, ease: "power1.out" },
    0.6,
  );

  // The knife comes down onto the tomato...
  gsap.set(knife, { y: G.contact - 300, autoAlpha: 0 });
  fromTo(knife, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: "none" }, 1.1);
  tl.to(knife, { y: G.contact, duration: 0.48, ease: "power2.in" }, 1.1);
  // ...and presses instead of cutting.
  tl.to(tomato, { scaleY: 0.9, scaleX: 1.06, duration: 0.25, ease: "power2.out" }, 1.58);
  tl.to(knife, { y: G.contact + G.squash * 0.1, duration: 0.25, ease: "power2.out" }, 1.58);

  // Drag 1: forward.
  tl.to(knife, { x: 90, rotation: -1.2, duration: 0.9, ease: "sine.inOut" }, 1.65);
  tl.to(tomato, { skewX: -5, x: 10, duration: 0.45, ease: "sine.out" }, 1.65);
  tl.to(tomato, { skewX: 0, x: 0, duration: 0.45, ease: "sine.in" }, 2.1);
  // Drag 2: back, pressing harder until the skin gives.
  tl.to(
    knife,
    { x: -40, rotation: 1.4, y: G.contact + G.squash * 0.2, duration: 0.9, ease: "sine.inOut" },
    2.65,
  );
  tl.to(tomato, { scaleY: 0.8, scaleX: 1.13, skewX: 5, duration: 0.9, ease: "sine.inOut" }, 2.65);
  tl.to(knife, { rotation: 0, duration: 0.4, ease: "sine.out" }, 3.55);

  // Juice squirts sideways from under the blade and lands on the board.
  const startY = G.tomatoTop + G.squash * 0.25;
  const floor = G.box.height * 0.8;
  $$(".juice", kitchen).forEach((d, i) => {
    const dir = i % 2 ? 1 : -1;
    const size = rr(9, 20);
    const dx = dir * rr(60, 240);
    const up = rr(40, 140);
    const land = floor - startY - rr(0, 60);
    const t = 2.85 + i * 0.035;
    gsap.set(d, {
      left: G.tomatoCx - size / 2 + dir * 20,
      top: startY,
      bottom: "auto",
      width: size,
      height: size,
    });
    tl.set(d, { opacity: 1 }, t);
    fromTo(d, { x: 0 }, { x: dx, duration: 0.55, ease: "power1.out" }, t);
    fromTo(
      d,
      { y: 0 },
      {
        keyframes: [
          { y: -up, duration: 0.22, ease: "power2.out" },
          { y: land, duration: 0.33, ease: "power2.in" },
        ],
      },
      t,
    );
    tl.to(d, { scaleY: 0.45, scaleX: 1.5, duration: 0.12, ease: "power2.out" }, t + 0.55);
  });

  tl.to(word, { opacity: 0.6, duration: 1, ease: "sine.inOut" }, 2.9);
  hide(el, 4.35, 0.4);
}

/* ---------- 2. Sharp. (4.5 – 8.75) ---------- */
{
  const el = S.sharp;
  const t0 = 4.5;
  const word = $(".ln > span", el);
  const kitchen = $(".kitchen", el);
  const tomato = $(".tomato", kitchen);
  const knife = $(".knife", kitchen);
  const slices = $$(".slice", kitchen);
  const G = GS;
  const hover = G.contact - 70;

  // Hard cut on the hit: everything is simply there.
  show(el, t0);
  tl.set($(".spot", el), { opacity: 1 }, t0);
  push(el, t0, 8.75, 1.035);
  gsap.set(word, { yPercent: 70 });
  fromTo(word, { yPercent: 70 }, { yPercent: 0, duration: 0.4, ease: "expo.out" }, t0);
  fromTo(
    word,
    { backgroundPosition: "100% 0%" },
    { backgroundPosition: "0% 0%", duration: 0.75, ease: "power2.inOut" },
    t0 + 0.25,
  );
  const line = $(".edge line", el);
  gsap.set(line, { drawSVG: "0% 0%" });
  fromTo(
    line,
    { drawSVG: "0% 0%" },
    { drawSVG: "0% 100%", duration: 0.45, ease: "expo.inOut" },
    t0 + 0.22,
  );
  tl.to(line, { drawSVG: "100% 100%", duration: 0.5, ease: "expo.inOut" }, t0 + 0.85);

  // The knife hovers, catches the light, then falls through in one stroke.
  gsap.set(knife, { y: hover });
  fromTo(knife, { y: hover - 30 }, { y: hover, duration: 0.8, ease: "power2.out" }, t0);
  knifeGlint(knife, t0 + 0.3, 0.55);
  tl.to(knife, { y: G.board, duration: 0.26, ease: "power3.in" }, 5.4);
  gsap.set(slices, { autoAlpha: 0 });
  tl.set(tomato, { autoAlpha: 0 }, 5.66);

  // The tomato opens into clean slices that fall flat, shingled across the
  // board: each starts edge-on inside the tomato and tips over onto the
  // board's top face.
  const spread = G.tomato.width * (SQ ? 0.36 : 0.34);
  const slice0 = rect(slices[0]);
  const faceY = G.box.top + G.box.height * 0.72; // middle of the board's top face
  const drop = faceY - (slice0.top + slice0.height / 2);
  slices.forEach((s, i) => {
    const o = i - (SLICES - 1) / 2;
    const t = 5.66 + i * 0.08;
    tl.set(s, { autoAlpha: 1 }, 5.66);
    fromTo(
      s,
      { x: 0, y: 0, scaleX: 0.14, scaleY: 1, rotation: 0 },
      {
        x: o * spread,
        y: drop + Math.abs(o) * 4,
        scaleX: 0.96,
        scaleY: 0.56,
        rotation: o * 4,
        duration: 0.6,
        ease: "expo.out",
      },
      t,
    );
  });
  // The knife lifts clear and rests above the cut, then one more glint.
  tl.to(knife, { y: hover - 40, x: 30, rotation: -2, duration: 0.8, ease: "power3.out" }, 5.95);
  knifeGlint(knife, 7.2, 0.6);
  const flare = $(".tip-flare", knife);
  gsap.set(flare, { transformOrigin: "50% 50%", scale: 0.2 });
  tl.to(flare, { opacity: 1, scale: 1, duration: 0.15, ease: "power2.out" }, 7.62);
  tl.to(flare, { opacity: 0, scale: 0.6, duration: 0.35, ease: "power1.in" }, 7.77);
  hide(el, 8.75, 0.5);
}

/* ---------- 3–4. Picked up / Back (8.75 – 17.95) ---------- */
{
  const el = S.door;
  const door = $(".doorway", el);
  const pick = $(".t-pick", el);
  const back = $(".t-back", el);
  const bag = $(".bag", door);
  const sparks = $$(".spark", door);

  gsap.set(bag, { xPercent: -50, transformOrigin: "50% 96%" });
  gsap.set($$(".ln > span", el), { yPercent: 110 });
  show(el, 8.75, 0.6);
  push(door, 8.75, 17.95, 1.04);

  // Night: the bag is out on the mat.
  linesIn(pick, 9.1);
  // Picked up: a small anticipation, then lifted and carried off frame.
  tl.to(bag, { scaleY: 0.95, scaleX: 1.03, duration: 0.14, ease: "power2.out" }, 10.26);
  tl.to(
    bag,
    { scaleY: 1.03, scaleX: 0.98, y: -90, rotation: -4, duration: 0.3, ease: "power2.out" },
    10.4,
  );
  tl.to(
    bag,
    {
      scaleY: 1,
      scaleX: 1,
      x: doorBox.width * 0.95,
      rotation: 9,
      duration: 0.55,
      ease: "power2.in",
    },
    10.66,
  );
  tl.set(bag, { autoAlpha: 0 }, 11.25);
  linesOut(pick, 12.6);

  // Morning comes up.
  fromTo(
    $(".morning", door),
    { opacity: 0 },
    { opacity: 1, duration: 1.2, ease: "sine.inOut" },
    12.7,
  );
  linesIn(back, 13.6);

  // Back: the bag swings in from the right and settles on the mat.
  tl.set(bag, { autoAlpha: 1, x: doorBox.width, y: -110, rotation: 12 }, 14.28);
  tl.to(bag, { x: 0, y: 0, rotation: 0, duration: 0.64, ease: "power3.out" }, 14.3);
  tl.to(bag, { scaleY: 0.93, scaleX: 1.05, duration: 0.1, ease: "power2.out" }, 14.9);
  tl.to(bag, { scaleY: 1, scaleX: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }, 15.0);

  const size = doorBox.width * 0.05;
  sparks.forEach((s, i) => {
    const [fx, fy, sc] = SPARKS[i];
    gsap.set(s, {
      left: bagBox.left - doorBox.left + bagBox.width * fx - size / 2,
      top: bagBox.top - doorBox.top + bagBox.height * fy - size / 2,
    });
    const t = 15.25 + i * 0.11;
    fromTo(
      s,
      { scale: 0, rotation: -30, opacity: 1 },
      { scale: sc * 1.6, rotation: 45, duration: 0.3, ease: "back.out(3)" },
      t,
    );
    tl.to(s, { scale: 0, rotation: 90, duration: 0.35, ease: "power2.in" }, t + 0.32);
  });
  hide(el, 17.95, 0.55);
}

/* ---------- 5. Logo + CTA (18 – 23) ---------- */
{
  const el = S.logo;
  const logo = $(".logo", el);
  const name = $(".name", el);
  const cta = $(".cta", el);
  const chars = SplitText.create(name, { type: "chars,lines", mask: "lines" }).chars;

  show(el, 18.0);
  fromTo(
    $(".glow", el),
    { autoAlpha: 0, scale: 0.7 },
    { autoAlpha: 1, scale: 1, duration: 1.6, ease: "power2.out" },
    18.0,
  );
  fromTo(
    logo,
    { scale: 0.55, autoAlpha: 0 },
    { scale: 1, autoAlpha: 1, duration: 0.8, ease: "back.out(1.8)" },
    18.0,
  );
  fromTo(
    $(".sheen", logo),
    { attr: { x: -220 } },
    { attr: { x: 380 }, duration: 0.8, ease: "power2.inOut" },
    18.4,
  );
  gsap.set(chars, { yPercent: 110 });
  fromTo(
    chars,
    { yPercent: 110 },
    { yPercent: 0, duration: 0.7, stagger: 0.022, ease: "expo.out" },
    18.6,
  );
  gsap.set(cta, { autoAlpha: 0 });
  fromTo(
    cta,
    { autoAlpha: 0, y: 30 },
    { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" },
    19.4,
  );
  push($(".end", el), 18.0, 23.0, 1.03);
  hide(el, 22.9, 0.6);
}

/* ------------------------------------------------------------------ */
/* Public API for the renderer                                         */
/* ------------------------------------------------------------------ */
function seek(t) {
  tl.seek(Math.min(Math.max(t, 0), DURATION));
  for (const u of updaters) u(t);
}
seek(0);
window.__video = { mode: MODE, cut: CUT, fps: FPS, duration: DURATION, width: W, height: H, seek };
document.body.dataset.ready = "1";
