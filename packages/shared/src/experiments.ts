import { FLYER_ROUTES } from "./flyer-routes.ts";
import type { Experiment, OfferVersion, PriceVersion, ResolvedExperiment } from "./types.ts";

/**
 * Experiment registry.
 *
 * This file is the single source of truth for what visitors see and pay.
 * Adding a test is a pull request that adds an offer and/or price version,
 * then an experiment that combines them. Never edit a version in place once
 * it has received traffic: add a new one and conclude the old experiment.
 */

export const OFFER_VERSIONS: readonly OfferVersion[] = [
  {
    id: "offer-001",
    headline: "Never cook with a dull knife again.",
    headline_highlight: "dull",
    subhead: "Westfield pickup, professional sharpening, fast return.",
    turnaround_promise: "Back at your door within 48 hours",
    cta_primary: "Sharpen My Knives",
    cta_secondary: "Join the Always Sharp Pilot",
    value_line: "Pickup and return included in Westfield.",
  },
  {
    id: "offer-002",
    headline: "Your knives. Sharp tomorrow.",
    headline_highlight: "Sharp",
    subhead: "We pick up today, sharpen tonight, and return tomorrow.",
    turnaround_promise: "Back at your door the next day",
    cta_primary: "Sharpen My Knives",
    cta_secondary: "Join the Always Sharp Pilot",
    value_line: "Next-day return, pickup included in Westfield.",
  },
];

export const PRICE_VERSIONS: readonly PriceVersion[] = [
  {
    id: "price-001",
    currency: "usd",
    bundle_price_cents: 3900,
    knives_included: 4,
    extra_knife_price_cents: 1000,
    max_knives: 12,
  },
  {
    id: "price-002",
    currency: "usd",
    bundle_price_cents: 4900,
    knives_included: 5,
    extra_knife_price_cents: 1000,
    max_knives: 12,
  },
];

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: "experiment-001",
    name: "Baseline bundle",
    hypothesis:
      "Westfield households will pay $39 for a 4-knife bundle when the pitch is about never cooking with a dull knife.",
    status: "active",
    offer_version: "offer-001",
    price_version: "price-001",
    weight: 1,
    started_at: "2026-09-24",
  },
  {
    id: "experiment-002",
    name: "Speed-led premium bundle",
    hypothesis:
      "A next-day promise justifies a higher $49 price for a 5-knife bundle and converts at least as well as the baseline.",
    status: "active",
    offer_version: "offer-002",
    price_version: "price-002",
    weight: 1,
    started_at: "2026-09-24",
  },
];

/** Experiment used when nothing else can be resolved (e.g. bad URL param). */
export const DEFAULT_EXPERIMENT_ID = "experiment-001";

export function getOfferVersion(id: string): OfferVersion | undefined {
  return OFFER_VERSIONS.find((o) => o.id === id);
}

export function getPriceVersion(id: string): PriceVersion | undefined {
  return PRICE_VERSIONS.find((p) => p.id === id);
}

export function getExperiment(
  id: string,
  experiments: readonly Experiment[] = EXPERIMENTS,
): Experiment | undefined {
  return experiments.find((e) => e.id === id);
}

export function activeExperiments(experiments: readonly Experiment[] = EXPERIMENTS): Experiment[] {
  return experiments.filter((e) => e.status === "active" && e.weight > 0);
}

/**
 * Resolve an experiment id to its offer and price. Returns undefined for
 * unknown ids. Deliberately ignores `status` and `weight`: an experiment
 * that is paused or concluded still resolves to the exact copy and price it
 * always had, because a pin to it (a flyer QR, a stored browser assignment)
 * must keep working for as long as the id exists. `status`/`weight` only
 * gate whether an experiment receives *fresh* random assignment; see
 * `activeExperiments` and `assignExperiment`.
 */
export function resolveExperiment(
  id: string,
  experiments: readonly Experiment[] = EXPERIMENTS,
): ResolvedExperiment | undefined {
  const experiment = getExperiment(id, experiments);
  if (!experiment) return undefined;
  const offer = getOfferVersion(experiment.offer_version);
  const price = getPriceVersion(experiment.price_version);
  if (!offer || !price) return undefined;
  return { experiment, offer, price };
}

/**
 * True when `id` may be used right now to show or charge for an experiment,
 * whether that's a fresh visitor or one returning to a pin:
 *
 * - it is one of today's currently active, weighted experiments, or
 * - it is one of the fixed ids a physical flyer promises forever
 *   (`FLYER_ROUTES`), regardless of the experiment's current status.
 *
 * A flyer's printed price is a promise we cannot take back once it has been
 * handed to someone, so those ids stay honorable after the experiment is
 * paused or concluded. Nothing else does: a draft that was never shown to
 * anyone, or a concluded *organic-only* test nobody holds a physical claim
 * on, must not be reachable just because a client asserts its id — the full
 * registry, including old ids, ships inside the web bundle and is trivially
 * readable, so this is a real boundary, not obscurity.
 */
export function isHonorablePin(
  id: string,
  experiments: readonly Experiment[] = EXPERIMENTS,
): boolean {
  if (activeExperiments(experiments).some((e) => e.id === id)) return true;
  return (
    FLYER_ROUTES.some((r) => r.experiment_id === id) && getExperiment(id, experiments) !== undefined
  );
}

/**
 * Like resolveExperiment, but only for an honorable id (see
 * `isHonorablePin`) — anything else, including an unknown id, falls back to
 * DEFAULT_EXPERIMENT_ID.
 */
export function resolveExperimentOrDefault(
  id: string | null | undefined,
  experiments: readonly Experiment[] = EXPERIMENTS,
): ResolvedExperiment {
  const resolved =
    id && isHonorablePin(id, experiments) ? resolveExperiment(id, experiments) : undefined;
  if (resolved) return resolved;
  const fallback = resolveExperiment(DEFAULT_EXPERIMENT_ID, experiments);
  if (!fallback) {
    throw new Error(`DEFAULT_EXPERIMENT_ID ${DEFAULT_EXPERIMENT_ID} is not a valid experiment`);
  }
  return fallback;
}

/**
 * Sanity checks run by tests and at API start-up so a broken registry fails
 * loudly instead of silently mis-pricing orders.
 */
export function validateRegistry(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const list of [OFFER_VERSIONS, PRICE_VERSIONS, EXPERIMENTS] as const) {
    for (const item of list) {
      if (seen.has(item.id)) problems.push(`duplicate id ${item.id}`);
      seen.add(item.id);
    }
  }
  for (const p of PRICE_VERSIONS) {
    if (p.bundle_price_cents <= 0) problems.push(`${p.id}: bundle price must be positive`);
    if (p.knives_included < 1) problems.push(`${p.id}: must include at least one knife`);
    if (p.max_knives < p.knives_included) problems.push(`${p.id}: max_knives below bundle size`);
    if (p.extra_knife_price_cents < 0) problems.push(`${p.id}: extra knife price negative`);
  }
  for (const e of EXPERIMENTS) {
    if (!getOfferVersion(e.offer_version))
      problems.push(`${e.id}: unknown offer ${e.offer_version}`);
    if (!getPriceVersion(e.price_version))
      problems.push(`${e.id}: unknown price ${e.price_version}`);
    if (e.weight < 0) problems.push(`${e.id}: negative weight`);
  }
  if (!getExperiment(DEFAULT_EXPERIMENT_ID)) problems.push("default experiment missing");
  if (activeExperiments().length === 0) problems.push("no active experiments");
  for (const route of FLYER_ROUTES) {
    if (!getExperiment(route.experiment_id)) {
      problems.push(`flyer route ${route.path}: unknown experiment ${route.experiment_id}`);
    }
  }
  return problems;
}
