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
    answer: "The turnaround for your booking is shown on this page and in the booking form.",
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
      "Westfield and the immediate neighbourhoods for now. If you are just outside, join the waitlist and tell us where you are; routes expand based on demand.",
  },
] as const;
