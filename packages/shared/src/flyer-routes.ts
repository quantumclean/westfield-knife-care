import type { AcquisitionChannel } from "./types.js";

/**
 * Vanity entry paths for physical flyers, e.g. `sharp.example.com/a`.
 *
 * A `?exp=` query parameter works too, but a bare path is the more robust
 * signal to print on a flyer: it survives being retyped by hand, it makes a
 * smaller, more reliably scannable QR code, and some link-preview and
 * messaging clients strip query strings when a link is shared or forwarded.
 * The path IS the pin, so it cannot be lost in transit.
 *
 * Each route also carries a default source and channel, so a flyer needs no
 * query parameters at all. `?src=`/`?ch=` on top of the vanity path still
 * override these, for print runs that want a finer-grained source tag (e.g.
 * distinguishing two batches of the same flyer).
 */
export interface FlyerRoute {
  path: string;
  experiment_id: string;
  source: string;
  acquisition_channel: AcquisitionChannel;
  label: string;
}

export const FLYER_ROUTES: readonly FlyerRoute[] = [
  {
    path: "/a",
    experiment_id: "experiment-001",
    source: "flyer-a",
    acquisition_channel: "print",
    label: "Flyer A ($39 / 4 knives)",
  },
  {
    path: "/b",
    experiment_id: "experiment-002",
    source: "flyer-b",
    acquisition_channel: "print",
    label: "Flyer B ($49 / 5 knives)",
  },
];

/**
 * Normalise a pathname for flyer matching: lowercased, with trailing slashes
 * removed (the root "/" is kept). This is deliberately narrow — it only
 * changes how a path is compared against the fixed flyer paths below. A path
 * that is not a flyer path still returns undefined and keeps its normal
 * (random) experiment assignment, so nothing else about assignment or pricing
 * moves.
 */
function normaliseFlyerPath(pathname: string): string {
  const lowered = pathname.toLowerCase().replace(/\/+$/, "");
  return lowered === "" ? "/" : lowered;
}

/**
 * Resolve a vanity flyer path to its pinned experiment and attribution.
 *
 * Matching tolerates the ways a hand-typed or shared flyer URL drifts: a
 * trailing slash (`/a/`) and letter case (`/A`) both still resolve to the
 * flyer, so a reader never lands on a random experiment and the wrong printed
 * price. It does NOT match prefixes: `/ab` or `/a/b` are not `/a`. QR codes
 * should still encode the exact canonical path (`/a`, `/b`).
 */
export function resolveFlyerRoute(pathname: string): FlyerRoute | undefined {
  const normalised = normaliseFlyerPath(pathname);
  return FLYER_ROUTES.find((r) => r.path === normalised);
}
