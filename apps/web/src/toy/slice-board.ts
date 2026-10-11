/**
 * "Swipe to test the edge": a small, original fruit-slicing toy for the hero.
 *
 * Swipe across the board (mouse movement, or a horizontal touch swipe) and
 * any fruit the blade crosses splits along the swipe into two halves that
 * show its cut face, tumble onto the board and fade, before a new fruit drops
 * in. It is decoration: the SVG is aria-hidden, nothing on the page depends
 * on it, and `touch-action: pan-y` keeps vertical swipes scrolling the page.
 *
 * Plain DOM and one requestAnimationFrame loop that only runs while
 * something is moving, so an idle board costs nothing.
 */
import { BOARD_TOP, FRUITS, FRUIT_ORDER, INK, type FruitId } from "../art/fruit.ts";
import { cutAngle, cutNormal, segmentHitsCircle, trailPath, type TrailPoint } from "./geometry.ts";

const NS = "http://www.w3.org/2000/svg";
const GRAVITY = 0.0022; // scene px per ms^2
const TRAIL_LIFE = 180; // ms
const MIN_SPEED = 0.45; // scene px per ms; slower movement never cuts
const HALF_LIFE = 2300; // ms from cut until a half has faded
const RESPAWN_AFTER = 2500; // ms from cut until a new fruit drops in

export interface SliceBoardOptions {
  /** x of each resting spot, with the fruit that starts there. */
  slots: readonly { x: number; fruit: FruitId }[];
  onSlice?: (fruit: FruitId) => void;
}

interface Body {
  el: SVGGElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  floor: number;
}
interface Whole extends Body {
  fruit: FruitId;
  slot: number;
}
interface Half extends Body {
  born: number;
  clip: SVGClipPathElement;
  /** Rotation at which the flat cut side faces down onto the board. */
  rest: number;
  landed: boolean;
  r: number;
  cut: number;
  side: 1 | -1;
}
interface Drop {
  el: SVGEllipseElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  landedAt: number | null;
}
interface Flash {
  el: SVGLineElement;
  born: number;
}

let boards = 0;

/**
 * How far a half reaches below its centre. A half is a half-disc whose dome
 * points along the cut normal: if the dome points down its lowest point is
 * the bottom of the circle, otherwise one end of the flat cut edge.
 */
function lowestPoint(h: { rot: number; cut: number; side: 1 | -1; r: number }): number {
  const phi = ((h.rot + h.cut) * Math.PI) / 180;
  const apexDown = h.side * Math.cos(phi) >= 0;
  return apexDown ? h.r : h.r * Math.abs(Math.sin(phi));
}

/** The angle equal to `target` (mod 360) that is closest to `from`. */
function nearestTurn(from: number, target: number): number {
  return target + Math.round((from - target) / 360) * 360;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function mountSliceBoard(svg: SVGSVGElement, options: SliceBoardOptions): () => void {
  const uid = `sb${++boards}`;
  const defs = svg.querySelector("defs") ?? svg.insertBefore(el("defs"), svg.firstChild);
  const fruitLayer = svg.querySelector<SVGGElement>(".sb-fruit")!;
  const fxLayer = el("g", { class: "sb-fx" });
  const trail = el("path", { class: "sb-trail", fill: INK, opacity: "0.88" });
  svg.append(fxLayer, trail);

  // One outline clip per fruit, slightly oversized so the ink edge survives.
  for (const id of FRUIT_ORDER) {
    const clip = el("clipPath", { id: `${uid}-body-${id}` });
    clip.append(el("path", { d: FRUITS[id].body, transform: "scale(1.05)" }));
    defs.append(clip);
  }

  const wholes: (Whole | null)[] = [];
  const halves: Half[] = [];
  const drops: Drop[] = [];
  const flashes: Flash[] = [];
  const respawns: { slot: number; at: number }[] = [];
  let nextFruit = options.slots.length;
  let points: TrailPoint[] = [];
  let last: TrailPoint | null = null;
  let frame = 0;
  let visible = true;
  let lastTick = 0;

  function place(b: Body) {
    b.el.setAttribute(
      "transform",
      `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.rot.toFixed(1)})`,
    );
  }

  function addWhole(slot: number, fruit: FruitId, dropIn: boolean) {
    const art = FRUITS[fruit];
    const g = el("g", { class: "sb-whole" });
    g.innerHTML = art.whole;
    fruitLayer.append(g);
    const floor = BOARD_TOP - art.bottom;
    const w: Whole = {
      el: g,
      fruit,
      slot,
      x: options.slots[slot]!.x,
      y: dropIn ? -art.r * 1.6 : floor,
      vx: 0,
      vy: 0,
      rot: dropIn ? (slot % 2 ? 12 : -12) : 0,
      vr: 0,
      floor,
    };
    place(w);
    wholes[slot] = w;
  }

  fruitLayer.replaceChildren();
  options.slots.forEach((s, i) => addWhole(i, s.fruit, false));

  function slice(w: Whole, deg: number, swipeVx: number, swipeVy: number, now: number) {
    const art = FRUITS[w.fruit];
    wholes[w.slot] = null;
    w.el.remove();
    respawns.push({ slot: w.slot, at: now + RESPAWN_AFTER });
    const n = cutNormal(deg);
    // A little of the swipe carries into the halves; most of the motion is the split itself.
    const sx = Math.max(-0.12, Math.min(0.12, swipeVx * 0.06));
    const sy = Math.max(-0.1, Math.min(0.1, swipeVy * 0.06));

    for (const side of [1, -1] as const) {
      const clip = el("clipPath", { id: `${uid}-h${now.toFixed(0)}-${w.slot}-${side}` });
      clip.append(
        el("rect", {
          x: -300,
          y: side === 1 ? 0 : -300,
          width: 600,
          height: 300,
          transform: `rotate(${deg.toFixed(1)})`,
        }),
      );
      defs.append(clip);
      const g = el("g", { class: "sb-half" });
      g.innerHTML = `<g clip-path="url(#${clip.id})"><g clip-path="url(#${uid}-body-${w.fruit})">${art.face}<line x1="-90" y1="0" x2="90" y2="0" transform="rotate(${deg.toFixed(1)})" stroke="${INK}" stroke-width="5"/></g></g>`;
      fxLayer.append(g);
      const h: Half = {
        el: g,
        clip,
        born: now,
        x: w.x + n.x * side * 3,
        y: w.y + n.y * side * 3,
        vx: n.x * side * 0.16 + sx,
        vy: n.y * side * 0.12 + sy - 0.4 - Math.random() * 0.1,
        rot: w.rot,
        vr: side * (0.12 + Math.random() * 0.1),
        floor: BOARD_TOP + 1,
        rest: nearestTurn(w.rot + side * 140, side === 1 ? 180 - deg : -deg),
        landed: false,
        r: art.r * 0.94,
        cut: deg,
        side,
      };
      place(h);
      halves.push(h);
    }

    // A clean red cut line flashes across the fruit.
    const r = (deg * Math.PI) / 180;
    const len = art.r * 1.25;
    const line = el("line", {
      x1: (w.x - Math.cos(r) * len).toFixed(1),
      y1: (w.y - Math.sin(r) * len).toFixed(1),
      x2: (w.x + Math.cos(r) * len).toFixed(1),
      y2: (w.y + Math.sin(r) * len).toFixed(1),
      stroke: "#f6e7c8",
      "stroke-width": 3,
      "stroke-linecap": "round",
    });
    fxLayer.append(line);
    flashes.push({ el: line, born: now });

    for (let i = 0; i < 9; i++) {
      const along = (Math.random() - 0.5) * art.r * 1.4;
      const size = 2 + Math.random() * 3.2;
      const drop = el("ellipse", {
        rx: size,
        ry: size,
        fill: art.juice,
        stroke: INK,
        "stroke-width": 0.8,
      });
      fxLayer.append(drop);
      drops.push({
        el: drop,
        x: w.x + Math.cos(r) * along,
        y: w.y + Math.sin(r) * along,
        vx: (Math.random() - 0.5) * 0.5 + n.x * (Math.random() - 0.5) * 0.6,
        vy: -0.25 - Math.random() * 0.45,
        landedAt: null,
      });
    }

    options.onSlice?.(w.fruit);
  }

  function tick(now: number) {
    frame = 0;
    const dt = Math.min(34, now - (lastTick || now));
    lastTick = now;
    let busy = false;

    const d = trailPath(points, now, TRAIL_LIFE, 13);
    trail.setAttribute("d", d);
    points = points.filter((p) => now - p.t < TRAIL_LIFE);
    if (d) busy = true;

    for (const w of wholes) {
      if (!w || (w.y >= w.floor && w.vy === 0 && w.rot === 0)) continue;
      busy = true;
      w.vy += GRAVITY * dt;
      w.y += w.vy * dt;
      w.rot *= 0.9;
      if (Math.abs(w.rot) < 0.2) w.rot = 0;
      if (w.y >= w.floor) {
        w.y = w.floor;
        w.vy = Math.abs(w.vy) > 0.12 ? -w.vy * 0.32 : 0;
      }
      place(w);
    }

    for (let i = halves.length - 1; i >= 0; i--) {
      const h = halves[i]!;
      const age = now - h.born;
      if (age > HALF_LIFE) {
        h.el.remove();
        h.clip.remove();
        halves.splice(i, 1);
        continue;
      }
      busy = true;
      h.vy += GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      if (!h.landed) h.rot += h.vr * dt;
      // Once down, rock onto the flat cut side.
      if (h.landed) h.rot += (h.rest - h.rot) * Math.min(1, dt * 0.018);
      const low = lowestPoint(h);
      if (h.y + low >= h.floor) {
        h.y = h.floor - low;
        h.vy = !h.landed && Math.abs(h.vy) > 0.12 ? -Math.abs(h.vy) * 0.22 : 0;
        h.vx *= 0.6;
        h.landed = true;
      }
      h.x = Math.max(60, Math.min(540, h.x));
      place(h);
      if (age > HALF_LIFE - 600) h.el.setAttribute("opacity", ((HALF_LIFE - age) / 600).toFixed(2));
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const p = drops[i]!;
      busy = true;
      if (p.landedAt === null) {
        p.vy += GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y >= BOARD_TOP + 2) {
          p.y = BOARD_TOP + 2;
          p.landedAt = now;
          p.el.setAttribute("ry", (Number(p.el.getAttribute("rx")) * 0.4).toFixed(1));
          p.el.setAttribute("rx", (Number(p.el.getAttribute("rx")) * 1.5).toFixed(1));
        }
        p.el.setAttribute("cx", p.x.toFixed(1));
        p.el.setAttribute("cy", p.y.toFixed(1));
      } else {
        const age = now - p.landedAt;
        if (age > 900) {
          p.el.remove();
          drops.splice(i, 1);
        } else if (age > 500) {
          p.el.setAttribute("opacity", ((900 - age) / 400).toFixed(2));
        }
      }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]!;
      const age = now - f.born;
      if (age > 260) {
        f.el.remove();
        flashes.splice(i, 1);
      } else {
        busy = true;
        f.el.setAttribute("opacity", (1 - age / 260).toFixed(2));
      }
    }

    for (let i = respawns.length - 1; i >= 0; i--) {
      const r = respawns[i]!;
      busy = true;
      if (now >= r.at) {
        respawns.splice(i, 1);
        addWhole(r.slot, FRUIT_ORDER[nextFruit++ % FRUIT_ORDER.length]!, true);
      }
    }

    if (busy && visible) frame = requestAnimationFrame(tick);
    else lastTick = 0;
  }

  function kick() {
    if (!frame && visible) frame = requestAnimationFrame(tick);
  }

  function toScene(e: PointerEvent): TrailPoint | null {
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y, t: e.timeStamp || performance.now() };
  }

  function onMove(e: PointerEvent) {
    const p = toScene(e);
    if (!p) return;
    const prev = last;
    last = p;
    points.push(p);
    kick();
    if (!prev) return;
    const dt = Math.max(1, p.t - prev.t);
    const vx = (p.x - prev.x) / dt;
    const vy = (p.y - prev.y) / dt;
    if (Math.hypot(vx, vy) < MIN_SPEED) return;
    for (const w of wholes) {
      if (w && segmentHitsCircle(prev, p, w, FRUITS[w.fruit].r * 0.92)) {
        slice(w, cutAngle(prev, p), vx, vy, performance.now());
        if (e.pointerType === "touch") navigator.vibrate?.(8);
      }
    }
  }
  function onEnd() {
    last = null;
  }

  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerdown", onEnd);
  svg.addEventListener("pointerleave", onEnd);
  svg.addEventListener("pointercancel", onEnd);
  svg.addEventListener("pointerup", onEnd);

  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) kick();
  });
  io.observe(svg);

  return () => {
    cancelAnimationFrame(frame);
    io.disconnect();
    svg.removeEventListener("pointermove", onMove);
    svg.removeEventListener("pointerdown", onEnd);
    svg.removeEventListener("pointerleave", onEnd);
    svg.removeEventListener("pointercancel", onEnd);
    svg.removeEventListener("pointerup", onEnd);
    fxLayer.remove();
    trail.remove();
  };
}
