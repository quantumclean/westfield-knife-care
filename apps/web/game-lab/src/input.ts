/**
 * Pointer input for mouse, pen and touch. Every move becomes a swipe segment
 * with its own timing; coalesced events are used where the browser offers
 * them, so a fast swipe can't skip an ingredient between frames.
 */
import type { Pt, TrailPoint } from "../../src/toy/geometry.ts";

export interface InputHandlers {
  segment(a: Pt, b: Pt, dtMs: number): void;
  /** The stroke is over: finger lifted, mouse left, or the pointer was cancelled. */
  end(): void;
  tap(x: number, y: number): void;
}

interface Track {
  x: number;
  y: number;
  t: number;
  down: boolean;
  downX: number;
  downY: number;
  downT: number;
  travel: number;
}

export const TRAIL_LIFE = 180; // ms, as in the hero toy

export class PointerInput {
  /** Recent points per pointer, for drawing blade trails. */
  trails = new Map<number, TrailPoint[]>();
  private tracks = new Map<number, Track>();

  constructor(
    private el: HTMLElement,
    private h: InputHandlers,
  ) {
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onCancel);
    el.addEventListener("pointerleave", this.onLeave);
  }

  destroy(): void {
    this.el.removeEventListener("pointerdown", this.onDown);
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("pointercancel", this.onCancel);
    this.el.removeEventListener("pointerleave", this.onLeave);
  }

  /** Drops trail points older than the trail's life. */
  prune(now: number): void {
    for (const [id, pts] of this.trails) {
      let i = 0;
      while (i < pts.length && now - pts[i]!.t > TRAIL_LIFE) i++;
      if (i) pts.splice(0, i);
      if (!pts.length && !this.tracks.has(id)) this.trails.delete(id);
    }
  }

  private local(e: PointerEvent): Pt {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private pushTrail(id: number, p: Pt, t: number): void {
    let pts = this.trails.get(id);
    if (!pts) this.trails.set(id, (pts = []));
    pts.push({ x: p.x, y: p.y, t });
    if (pts.length > 40) pts.shift();
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    if (e.pointerType !== "mouse") {
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const p = this.local(e);
    this.h.end();
    this.tracks.set(e.pointerId, {
      x: p.x,
      y: p.y,
      t: e.timeStamp,
      down: true,
      downX: p.x,
      downY: p.y,
      downT: e.timeStamp,
      travel: 0,
    });
    this.trails.set(e.pointerId, []);
    this.pushTrail(e.pointerId, p, e.timeStamp);
  };

  private onMove = (e: PointerEvent): void => {
    const tr = this.tracks.get(e.pointerId);
    if (!tr) {
      // A mouse cuts on hover, like the hero toy: start tracking on first move.
      if (e.pointerType === "mouse") {
        const p = this.local(e);
        this.tracks.set(e.pointerId, {
          ...p,
          t: e.timeStamp,
          down: false,
          downX: p.x,
          downY: p.y,
          downT: e.timeStamp,
          travel: 0,
        });
      }
      return;
    }
    let events: PointerEvent[] = [];
    try {
      events = e.getCoalescedEvents?.() ?? [];
    } catch {
      events = [];
    }
    if (!events.length) events = [e];
    for (const ev of events) {
      const p = this.local(ev);
      const dt = ev.timeStamp - tr.t;
      const dist = Math.hypot(p.x - tr.x, p.y - tr.y);
      if (dist < 0.5) continue;
      this.h.segment({ x: tr.x, y: tr.y }, p, dt > 0 ? dt : 1);
      tr.travel += dist;
      tr.x = p.x;
      tr.y = p.y;
      tr.t = ev.timeStamp;
      this.pushTrail(e.pointerId, p, ev.timeStamp);
    }
  };

  private onUp = (e: PointerEvent): void => {
    const tr = this.tracks.get(e.pointerId);
    if (tr?.down && tr.travel < 14 && e.timeStamp - tr.downT < 350) {
      this.h.tap(tr.downX, tr.downY);
    }
    this.h.end();
    if (e.pointerType === "mouse" && tr) tr.down = false;
    else this.tracks.delete(e.pointerId);
  };

  private onCancel = (e: PointerEvent): void => {
    this.h.end();
    this.tracks.delete(e.pointerId);
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType !== "mouse") return;
    this.h.end();
    this.tracks.delete(e.pointerId);
  };
}
