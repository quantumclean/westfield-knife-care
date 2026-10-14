/**
 * The Edge meter's rules (design section 2.3). Deterministic: no random
 * misses, so a dull knife is frustrating in a predictable, fair way.
 */
import { BAND_FLOOR, MIN_SPEED, POWER_SPEED, SWISH_SPEED, type Toughness } from "../levels.ts";

export type Band = "keen" | "worn" | "dull" | "gone";

export function bandOf(edge: number): Band {
  if (edge >= BAND_FLOOR.keen) return "keen";
  if (edge >= BAND_FLOOR.worn) return "worn";
  if (edge >= BAND_FLOOR.dull) return "dull";
  return "gone";
}

/**
 * - split: the ingredient comes apart (`weak`: the halves barely separate)
 * - notch: it took a hit but needs another stroke
 * - squash: a soft ingredient mashed instead of cut (half points)
 * - bounce: the blade glanced off
 * - skid: the blade slid off without biting (Gone)
 * - none: too slow to be a cut attempt
 */
export type Outcome = "split" | "notch" | "squash" | "bounce" | "skid" | "none";

export interface CutResult {
  outcome: Outcome;
  weak: boolean;
  power: boolean;
}

const result = (outcome: Outcome, weak = false, power = false): CutResult => ({
  outcome,
  weak,
  power,
});

/**
 * What one stroke does to one ingredient. `hits` is how many earlier strokes
 * already notched it. Hazards and pickups are handled by the world, not here.
 */
export function cutOutcome(band: Band, tough: Toughness, speed: number, hits: number): CutResult {
  if (speed < SWISH_SPEED) return result("none");
  if (band === "gone") return result("skid");
  if (speed < MIN_SPEED[band]) return result("bounce");
  const needs = (n: number, weak = false) =>
    hits + 1 >= n ? result("split", weak) : result("notch");
  switch (band) {
    case "keen":
      if (tough === "tough") return speed >= POWER_SPEED ? result("split", false, true) : needs(2);
      return result("split");
    case "worn":
      if (tough === "soft") return result("split");
      if (tough === "medium") return result("split", true);
      if (tough === "firm") return needs(2, true);
      return needs(3, true);
    case "dull":
      if (tough === "soft") return result("squash");
      if (tough === "medium") return needs(2, true);
      return result("bounce");
  }
  return result("none");
}
