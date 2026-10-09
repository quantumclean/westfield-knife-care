/**
 * Copy that is NOT under experiment. Anything a test might vary belongs in
 * experiments.ts as an offer version instead.
 */
export const BRAND = {
  name: "Westfield Knife Care",
  short_name: "Westfield",
  tagline: "Local knife sharpening.",
  service_area: "Westfield",
  support_email: "hello@sharp.usabiology.com",
} as const;

export const HOW_IT_WORKS = [
  {
    step: 1,
    title: "We pick up",
    body: "Choose an available pickup day when booking.",
    icon: "truck",
  },
  {
    step: 2,
    title: "We sharpen",
    body: "Your knives are sharpened.",
    icon: "knife",
  },
  {
    step: 3,
    title: "We return",
    body: "Return arrangements are confirmed with your order.",
    icon: "home",
  },
] as const;

export const WHY_US = [
  "Kitchen-knife sharpening",
  "Clear bundle pricing",
  "Available pickup dates shown before checkout",
  "Secure card checkout",
  "Optional pilot waitlist",
] as const;

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
      "Wrap each blade in a kitchen towel or cardboard sleeve and leave them in a bag at your door on your care day. We bring a lockable knife roll for the trip.",
  },
  {
    id: "turnaround",
    question: "How long does it take?",
    answer:
      "Available pickup dates appear during booking. Return timing and handoff details must be confirmed separately; no next-day or 48-hour turnaround is guaranteed.",
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
    answer:
      "Stripe processes your card payment when you complete checkout. No voluntary refund guarantee is offered. Refunds and other remedies required by applicable law remain available.",
  },
  {
    id: "area",
    question: "Which areas do you cover?",
    answer:
      "Service availability depends on your pickup address. Please confirm your area before paying; the waitlist is open to people interested in future availability.",
  },
] as const;
