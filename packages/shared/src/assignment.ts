import { activeExperiments, getExperiment, EXPERIMENTS } from "./experiments.ts";
import type { Experiment } from "./types.ts";

/**
 * FNV-1a 32-bit hash. Small, dependency-free and stable across runtimes so
 * the same visitor always lands in the same experiment.
 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically pick an experiment for a visitor using weighted buckets.
 * Returns undefined when no experiment is active.
 */
export function assignExperiment(
  visitorId: string,
  experiments: readonly Experiment[] = activeExperiments(),
): Experiment | undefined {
  const candidates = experiments.filter((e) => e.weight > 0);
  if (candidates.length === 0) return undefined;
  const totalWeight = candidates.reduce((sum, e) => sum + e.weight, 0);
  const point = (hashString(visitorId) % 10_000) / 10_000;
  let cursor = 0;
  for (const experiment of candidates) {
    cursor += experiment.weight / totalWeight;
    if (point < cursor) return experiment;
  }
  return candidates[candidates.length - 1];
}

export interface ExperimentSelectionInput {
  /** Explicit pin: a flyer QR, a vanity route (`/a`, `/b`), or `?exp=`. */
  requestedId?: string | null;
  /** Previously stored assignment for this browser. */
  storedId?: string | null;
  visitorId: string;
}

/**
 * Decide which experiment a visitor sees, in priority order:
 * 1. an explicitly requested experiment, honored for as long as it exists
 *    in the registry — even after it is paused or concluded. A flyer's
 *    printed price must never change under the reader after the fact.
 * 2. the experiment already stored for this browser, honored the same way,
 *    so a returning visitor's price never moves mid-experiment either.
 * 3. a fresh weighted assignment among *currently active* experiments, for
 *    a visitor who arrived with no pin at all (organic/direct traffic).
 *
 * `status` and `weight` therefore only control who gets randomly assigned
 * into an experiment next, never whether an existing pin keeps resolving.
 */
export function selectExperiment(
  input: ExperimentSelectionInput,
  experiments: readonly Experiment[] = EXPERIMENTS,
): Experiment | undefined {
  const pinned = (id: string | null | undefined): Experiment | undefined =>
    id ? getExperiment(id, experiments) : undefined;
  return (
    pinned(input.requestedId) ??
    pinned(input.storedId) ??
    assignExperiment(input.visitorId, activeExperiments(experiments))
  );
}
