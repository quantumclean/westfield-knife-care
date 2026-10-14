/**
 * Settings and the best score, kept only in this browser (design section 8.3).
 * Never sent anywhere. Storage can be missing or throw (private mode,
 * sandboxed previews), so every access is guarded and defaults always work.
 */
import { KNIFE_ORDER, type KnifeId, type LengthMode } from "./levels.ts";

export type MotionPref = "system" | "reduce" | "full";
export type GameMode = "street" | "classic";

export interface Prefs {
  muted: boolean;
  motion: MotionPref;
  length: LengthMode;
  mode: GameMode;
  knife: KnifeId;
  hardcore: boolean;
  /** Tutorials seen, per mode. */
  seenTutorial: boolean;
  seenStreet: boolean;
}

const PREFS_KEY = "wkc.game.prefs";
const BEST_KEY = "wkc.game.best";

export const DEFAULT_PREFS: Prefs = {
  muted: false,
  motion: "system",
  length: "quick",
  mode: "street",
  knife: "american",
  hardcore: false,
  seenTutorial: false,
  seenStreet: false,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      muted: p.muted === true,
      motion: p.motion === "reduce" || p.motion === "full" ? p.motion : "system",
      length: p.length === "full" ? "full" : "quick",
      mode: p.mode === "classic" ? "classic" : "street",
      knife: KNIFE_ORDER.includes(p.knife as KnifeId) ? (p.knife as KnifeId) : "american",
      hardcore: p.hardcore === true,
      seenTutorial: p.seenTutorial === true,
      seenStreet: p.seenStreet === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

export function loadBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(n)));
  } catch {
    /* ignore */
  }
}

export function systemReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function effectiveReducedMotion(p: Prefs): boolean {
  return p.motion === "reduce" || (p.motion === "system" && systemReducedMotion());
}
