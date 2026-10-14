/**
 * Tuning data for the vertical slice (design sections 2.3 to 2.8). Every
 * number here is a starting point for playtesting, not a measurement.
 */
import type { FruitId } from "../../src/art/fruit.ts";

export type IngredientId = FruitId | "carrot" | "onion" | "pineapple" | "squash" | "lid" | "glint";

export type Toughness = "soft" | "medium" | "firm" | "tough" | "hazard" | "pickup";

export interface Ingredient {
  tough: Toughness;
  /** Radius in world units (the camera sits 1 unit above the counter). */
  radius: number;
  points: number;
}

export const INGREDIENTS: Record<IngredientId, Ingredient> = {
  tomato: { tough: "soft", radius: 0.12, points: 10 },
  kiwi: { tough: "soft", radius: 0.105, points: 10 },
  lemon: { tough: "medium", radius: 0.12, points: 20 },
  apple: { tough: "medium", radius: 0.12, points: 20 },
  carrot: { tough: "firm", radius: 0.11, points: 30 },
  onion: { tough: "firm", radius: 0.115, points: 30 },
  pineapple: { tough: "tough", radius: 0.15, points: 50 },
  squash: { tough: "tough", radius: 0.145, points: 50 },
  lid: { tough: "hazard", radius: 0.13, points: 0 },
  glint: { tough: "pickup", radius: 0.09, points: 0 },
};

/* ---------- The Edge meter ---------- */

export const BAND_FLOOR = { keen: 70, worn: 40, dull: 15, gone: 0 } as const;

/** Minimum swipe speed per band, in scene units per ms (the hero toy's MIN_SPEED is 0.45). */
export const MIN_SPEED = { keen: 0.45, worn: 0.7, dull: 1.0, gone: 0.45 } as const;
/** Slower than this never counts as a cut attempt at all. */
export const SWISH_SPEED = 0.45;
/** A tough ingredient falls to one stroke at this speed or faster when the edge is Keen. */
export const POWER_SPEED = 1.6;
/** Speeds used for taps and keyboard cuts, which have no real swipe speed. */
export const TAP_SPEED = 1.05;

/** Level 1 edge wear per cut, at the full 45 s length. Scaled for other lengths. */
export const L1_CUT_WEAR: Record<Toughness, number> = {
  soft: 0.8,
  medium: 1.1,
  firm: 1.5,
  tough: 2,
  hazard: 0,
  pickup: 0,
};
/** Share of the edge that time alone wears away over the nominal Level 1 length. */
export const L1_TIME_WEAR = 60;
/** After the nominal length, the remaining edge goes within this share of it. */
export const L1_OVERTIME = 0.2;
/** Story guarantee: at this multiple of the nominal length, the edge is gone whatever happens. */
export const L1_HARD_STOP = 1.3;
export const HAZARD_WEAR = { level1: 12, level2: 8 } as const;

export const L2_PASSIVE_WEAR = 0.15; // per second
export const L2_CUT_WEAR = 0.3;
export const GLINT_EDGE = 10;

/* ---------- Lengths ---------- */

export type LengthMode = "quick" | "full";
export const LENGTHS: Record<LengthMode, { l1: number; l2: number }> = {
  quick: { l1: 25, l2: 30 },
  full: { l1: 45, l2: 50 },
};

/* ---------- The counter ---------- */

export const Z_FAR = 11;
/** Where an ingredient leaves the counter and hops up into the cut zone. */
export const Z_HOP = 2.6;
/** Where it comes down again, past the near edge of the counter. */
export const Z_LAND = 1.2;
/** Reduced motion: ingredients appear in place at this depth. */
export const Z_STILL = 1.55;
export const MAX_ITEMS = 24;

export interface SpawnPhase {
  /** Upper bound of this phase, as a share of the level length. */
  until: number;
  /** Spawn events per second (an event can be a pair or a cluster). */
  rate: number;
  pool: readonly IngredientId[];
  pair: number;
  cluster: number;
  hazard: number;
  glint: number;
}

export interface LevelSpec {
  /** Counter speed in z units per second. */
  ride: number;
  gravity: number;
  apex: readonly [number, number];
  /** How long a reduced-motion ingredient stays up. */
  stillLife: number;
  phases: readonly SpawnPhase[];
}

const L1_POOL_A = ["tomato", "lemon", "apple", "kiwi"] as const;
const L1_POOL_B = [...L1_POOL_A, "carrot"] as const;
const L1_POOL_C = [...L1_POOL_B, "onion"] as const;
const L2_POOL = [...L1_POOL_C, "pineapple", "squash"] as const;

export const LEVEL1: LevelSpec = {
  ride: 3.0,
  gravity: 3.0,
  apex: [0.42, 0.72],
  stillLife: 2.8,
  phases: [
    { until: 0.3, rate: 0.8, pool: L1_POOL_A, pair: 0, cluster: 0, hazard: 0, glint: 0 },
    { until: 0.6, rate: 1.0, pool: L1_POOL_B, pair: 0.25, cluster: 0, hazard: 0.08, glint: 0 },
    { until: 99, rate: 1.15, pool: L1_POOL_C, pair: 0.3, cluster: 0, hazard: 0.1, glint: 0 },
  ],
};

export const LEVEL2: LevelSpec = {
  ride: 4.8,
  gravity: 3.6,
  apex: [0.45, 0.78],
  stillLife: 2.3,
  phases: [
    { until: 0.3, rate: 1.3, pool: L1_POOL_C, pair: 0.3, cluster: 0, hazard: 0.05, glint: 0.04 },
    { until: 0.65, rate: 1.5, pool: L2_POOL, pair: 0.3, cluster: 0.1, hazard: 0.07, glint: 0.05 },
    { until: 0.9, rate: 1.4, pool: L2_POOL, pair: 0.2, cluster: 0.45, hazard: 0.06, glint: 0.05 },
    { until: 99, rate: 2.3, pool: L2_POOL, pair: 0.5, cluster: 0.2, hazard: 0, glint: 0.08 },
  ],
};

/* ---------- Service sequence ---------- */

export const SHARPEN_STROKES = 8;
export const PICKUP_SECONDS = 4.2;
export const EDGE_GONE_SECONDS = 2.8;
export const RESTORED_SECONDS = 2.4;
/** Time after the last spawn before a finished level hands over. */
export const LEVEL_END_GRACE = 1.6;

/* ---------- Scoring ---------- */

export const CLEAN_SHARE = 0.3; // stroke within 30% of the centre
export const CLEAN_BONUS = 10;
export const COMBO_WINDOW = 0.25; // seconds after the last cut in a stroke
export const SWEEP_COOLDOWN = 1.5;
