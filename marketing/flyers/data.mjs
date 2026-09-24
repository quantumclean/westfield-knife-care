// Flyer copy, mirrored by hand from packages/shared/src/experiments.ts.
//
// These are static print files, not code the app imports, so nothing keeps
// them in sync automatically. If you change an offer or price version in
// the app registry, update the matching flyer here too — and vice versa:
// never change what's printed on a flyer that's already out without also
// concluding that experiment and starting a new one (see
// docs/experiment-plan.md and packages/shared/src/flyer-routes.ts).
export const FLYERS = {
  a: {
    id: "a",
    path: "/a",
    experimentId: "experiment-001",
    headline: "Never cook with a",
    headlineHighlight: "Dull",
    headlineRest: "Knife Again.",
    subhead: "We pick up in Westfield, professionally sharpen, and return—fast.",
    price: "$39",
    priceDetail: "4 knives",
    perKnife: "for 4 knives, pickup and return included",
    turnaround: "Back at your door within 48 hours.",
  },
  b: {
    id: "b",
    path: "/b",
    experimentId: "experiment-002",
    headline: "Your Knives.",
    headlineHighlight: "Sharp",
    headlineRest: "Tomorrow.",
    subhead: "We pick up today, sharpen tonight, and return tomorrow.",
    price: "$49",
    priceDetail: "5 knives",
    perKnife: "for 5 knives, pickup and return included",
    turnaround: "Back at your door the next day.",
  },
};
