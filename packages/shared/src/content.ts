/**
 * Copy that is NOT under experiment. Anything a test might vary belongs in
 * experiments.ts as an offer version instead.
 */
export const BRAND = {
  name: "Westfield Knife Care",
  short_name: "Westfield",
  tagline: "Local service. No shipping. Real people.",
  service_area: "Westfield",
  support_email: "sales@usabiology.com",
} as const;

/**
 * Where pickups happen. Owner decision (2026-10-10): Westfield and its
 * neighbouring towns. The order schema rejects any other ZIP, so nobody pays
 * for a pickup that cannot happen; the booking sheet offers the waitlist.
 */
export const SERVICE_AREA = [
  { zip: "07090", town: "Westfield" },
  { zip: "07091", town: "Westfield" },
  { zip: "07092", town: "Mountainside" },
  { zip: "07027", town: "Garwood" },
  { zip: "07016", town: "Cranford" },
  { zip: "07076", town: "Scotch Plains" },
  { zip: "07023", town: "Fanwood" },
] as const;

/** Town names in the service area, once each, in display order. */
export const SERVICE_TOWNS: readonly string[] = [...new Set(SERVICE_AREA.map((a) => a.town))];

/** True for a 5-digit ZIP or ZIP+4 whose first five digits are served. */
export function isServedZip(zip: string): boolean {
  const five = zip.trim().slice(0, 5);
  return SERVICE_AREA.some((a) => a.zip === five);
}

/** "Westfield, Mountainside, …, Scotch Plains and Fanwood" */
export function serviceTownsLabel(): string {
  const towns = [...SERVICE_TOWNS];
  return towns.length > 1
    ? `${towns.slice(0, -1).join(", ")} and ${towns.at(-1)}`
    : (towns[0] ?? "");
}

export const HOW_IT_WORKS = [
  {
    step: 1,
    title: "We pick up",
    body: "Schedule a pickup at your address in Westfield.",
    icon: "truck",
  },
  {
    step: 2,
    title: "We sharpen",
    body: "We sharpen your knives.",
    icon: "knife",
  },
  {
    step: 3,
    title: "We return",
    body: "Back to your doorstep.",
    icon: "home",
  },
] as const;

export const WHY_US = ["Local, no shipping", "Support a local business"] as const;

export const FAQ = [
  {
    id: "what-knives",
    question: "What kinds of knives do you sharpen?",
    answer:
      "Kitchen knives of all kinds: chef's, santoku, paring, bread and carving knives. Serrated blades and ceramic knives are handled case by case, so mention them in the notes.",
  },
  {
    id: "how-to-pack",
    question: "How should I hand over my knives?",
    answer:
      "Wrap each blade in a kitchen towel or cardboard sleeve and leave them in a bag at your door on your care day.",
  },
  {
    id: "turnaround",
    question: "How long does it take?",
    answer:
      "You choose the pickup day when you book, and we collect between 8am and 12pm. Return timing is confirmed separately for each booking.",
  },
  {
    id: "always-sharp",
    question: "What is the Always Sharp pilot?",
    answer:
      "A swap program: hand us a dull knife and take a freshly sharpened one from the same set, on a weekly, biweekly or monthly rhythm. We are building the waitlist now and will invite Westfield households first.",
  },
  {
    id: "payment",
    question: "How do I pay?",
    answer: "Securely by card through Stripe when you book.",
  },
  {
    id: "area",
    question: "Which areas do you cover?",
    answer:
      "Westfield, Mountainside, Garwood, Cranford, Scotch Plains and Fanwood for now. If you are outside those towns, join the waitlist and tell us where you are; routes expand based on demand.",
  },
] as const;
