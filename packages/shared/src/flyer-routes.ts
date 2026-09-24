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

export function resolveFlyerRoute(pathname: string): FlyerRoute | undefined {
  return FLYER_ROUTES.find((r) => r.path === pathname);
}
