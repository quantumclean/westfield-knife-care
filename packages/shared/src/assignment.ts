import { activeExperiments, getExperiment } from "./experiments.ts";
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
  /** Explicit override, usually from `?exp=` on a flyer QR link. */
  requestedId?: string | null;
  /** Previously stored assignment for this browser. */
  storedId?: string | null;
  visitorId: string;
}

/**
 * Decide which experiment a visitor sees, in priority order:
 * 1. an explicit, currently active experiment requested in the URL
 * 2. the experiment already stored for this browser, if still active
 * 3. a fresh weighted assignment
 */
export function selectExperiment(input: ExperimentSelectionInput): Experiment | undefined {
  const active = activeExperiments();
  const isActive = (id: string | null | undefined): Experiment | undefined => {
    if (!id) return undefined;
    const experiment = getExperiment(id);
    return experiment && active.includes(experiment) ? experiment : undefined;
  };
  return (
    isActive(input.requestedId) ??
    isActive(input.storedId) ??
    assignExperiment(input.visitorId, active)
  );
}
