/**
 * Copy that is NOT under experiment. Anything a test might vary belongs in
 * experiments.ts as an offer version instead.
 */
export const BRAND = {
  name: "Westfield Knife Care",
  short_name: "Westfield",
  tagline: "Local service. Real people.",
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
    body: "Schedule a pickup at your address in our service area.",
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

export const WHY_US = ["Local pickup and return", "Support a local business"] as const;

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
      "Wash and dry each knife, slide each blade into a cardboard sleeve or blade guard, put them together in a sturdy bag or box, and leave it at your door on your care day. A loose towel on its own can slip, so make sure each cover stays on. The Getting ready section has the steps.",
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
  {
    id: "mail-in",
    question: "Can I mail my knives to you?",
    answer:
      "Not yet. We are finding out whether people want mail-in sharpening. There is no shipping kit, price or start date yet, so please do not send knives to us. Tell us you are interested and we will email you if it opens.",
  },
  {
    id: "gift",
    question: "Can I give this as a gift?",
    answer:
      "Not yet. A gift would be a way to pay for someone else's sharpening; their knives would still go through local pickup or mail-in. We are not selling gifts yet. Tell us you are interested and we will email you if they open.",
  },
] as const;

/** Section that explains the three choices. Only local pickup can be booked today. */
export const WAYS_INTRO = {
  title: "Three ways to a fresh edge",
  subtitle:
    "Pickup is open now. Mail-in and gifts are ideas we are testing, so tell us if you would use them.",
  how_heading: "How we get your knives",
} as const;

export const PICKUP_WAY = {
  title: "Local pickup and return",
  status: "Open for booking",
  body: "We collect your knives from your door, sharpen them, and bring them back to your doorstep.",
} as const;

export const MAIL_IN_WAY = {
  title: "Mail-in sharpening",
  status: "Coming soon · interest only",
  body: "For people outside our pickup towns. There is no price, shipping method or start date yet, and no shipping kit.",
  note: "Please do not mail knives to us.",
  cta: "Tell us you are interested",
} as const;

export const GIFT_WAY = {
  eyebrow: "Buying for someone else?",
  title: "Give it as a gift",
  status: "Coming soon · interest only",
  body: "A gift is a way to pay for someone else's sharpening. It is not a third way to handle knives: theirs would still go by local pickup or mail-in.",
  note: "We are not selling gifts yet. Nothing is charged, and we do not need your recipient's details.",
  cta: "Tell us you are interested",
} as const;

/** Preparation guidance for handing knives over. Customer instructions only, no service claims. */
export const PREP = {
  title: "Getting your knives ready",
  subtitle: "A few minutes of prep keeps everyone's fingers safe, whoever handles the bag.",
  steps: [
    { id: "wash", title: "Wash and dry", body: "Wash each knife by hand, then dry it." },
    {
      id: "wrap",
      title: "Cover each blade",
      body: "Slide each blade into a cardboard sleeve or blade guard. A loose towel can slip, so check the cover stays put.",
    },
    {
      id: "bag",
      title: "Pack them together",
      body: "Put the covered knives in a sturdy bag or small box so no blade can poke through.",
    },
    {
      id: "door",
      title: "Leave it at your door",
      body: "Set it where you told us to look, out of the rain, before 8am on pickup morning.",
    },
  ],
  unsure:
    "Serrated, ceramic, a loose handle, or a knife you cannot replace? Add a note when you book.",
  back_home: {
    title: "When they come back",
    body: "Open the package with the blades pointing away from you, and wash and dry each knife before you first use it.",
  },
  mail_in: {
    title: "Mail-in, when it opens",
    body: "Mail-in is not available yet and we have no shipping kit, so please do not send knives to us. If it opens, we will confirm how to pack and ship before anything is sent. The same basics will apply: clean, dry, covered, and packed so no blade can poke through.",
  },
} as const;
