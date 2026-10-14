import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BRAND,
  FAQ,
  GIFT_WAY,
  HOW_IT_WORKS,
  MAIL_IN_WAY,
  PICKUP_WAY,
  PREP,
  WAYS_INTRO,
  WHY_US,
} from "@wkc/shared";

/**
 * Owner decision (2026-10-09): the business offers no refunds and makes no
 * claims it cannot back up. This keeps promises of that kind out of the copy
 * every visitor sees.
 *
 * Deliberately NOT scanned: the offer versions in packages/shared/src/experiments.ts.
 * They are frozen experiment definitions (editing one in place would corrupt the
 * running test), and they still carry turnaround wording. Changing them needs a
 * new offer version and experiment, not an edit.
 */
const BANNED: readonly [RegExp, string][] = [
  [/refund/i, "refund promises"],
  [/we (will|'ll) text|text you|texts? when|pickup and return texts/i, "SMS promises"],
  [/lockable/i, "knife-roll claim"],
  [/\btrusted\b/i, '"trusted" claim'],
  [/\bprofessional\b|\bpro sharpening\b|precision equipment/i, "professional or equipment claim"],
  [/safer, better/i, "safer or better cooking claim"],
  [/fast (turnaround|return)|return fast/i, "speed claim"],
  [/most orders|always within/i, "turnaround statistic"],
  [/only charged once/i, "charging promise"],
  [/home or office/i, "unverified pickup locations"],
  // Added with mail-in and gifts (interest only): nothing here is verified or on sale.
  [/sanitiz|sanitis|disinfect|germ[- ]free|steriliz|sterilis/i, "sanitization claim"],
  [/\binsur(ed|ance)\b/i, "insurance claim"],
  [/\bguarantee/i, "guarantee claim"],
  [
    /free shipping|prepaid (label|postage)|shipping kit (is|are) (available|included|ready)/i,
    "shipping or kit availability claim",
  ],
];

const web = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(web, file), "utf8");

const sections = readdirSync(resolve(web, "src/sections")).map((f) => `src/sections/${f}`);
const SOURCES: Record<string, string> = {
  "shared content (HOW_IT_WORKS, WHY_US, FAQ, BRAND)": JSON.stringify({
    BRAND,
    HOW_IT_WORKS,
    WHY_US,
    FAQ,
  }),
  "shared content (three ways, getting ready)": JSON.stringify({
    WAYS_INTRO,
    PICKUP_WAY,
    MAIL_IN_WAY,
    GIFT_WAY,
    PREP,
  }),
  "index.html (title, description, social tags)": read("index.html"),
  "src/forms/BookingForm.tsx": read("src/forms/BookingForm.tsx"),
  "src/forms/PilotForm.tsx": read("src/forms/PilotForm.tsx"),
  "src/thanks.tsx": read("src/thanks.tsx"),
  "src/lib/ics.ts (calendar reminder text)": read("src/lib/ics.ts"),
  "src/toy/slice-board.ts": read("src/toy/slice-board.ts"),
  ...Object.fromEntries(sections.map((f) => [f, read(f)])),
};

describe("customer-facing copy makes no unverified promises", () => {
  for (const [source, text] of Object.entries(SOURCES)) {
    it(`${source}`, () => {
      for (const [pattern, label] of BANNED) {
        expect(text, `${label} found in ${source}`).not.toMatch(pattern);
      }
    });
  }

  it("still tells customers what they need to do and what they will pay", () => {
    // Guard against over-correcting: the useful, verifiable text must survive.
    // JSX text is line-wrapped by Prettier, so compare with whitespace collapsed.
    const thanks = read("src/thanks.tsx").replace(/\s+/g, " ");
    expect(thanks).toContain("Leave them wrapped in a bag at your door in the morning.");
    expect(read("src/forms/BookingForm.tsx")).toContain("Secure card payment via Stripe.");
    expect(FAQ.find((q) => q.id === "payment")?.answer).toBe(
      "Securely by card through Stripe when you book.",
    );
  });

  it("never points to a turnaround the page does not show", () => {
    // The FAQ once said the turnaround "is shown on this page and in the booking form"
    // while both said return timing is confirmed separately.
    const answer = FAQ.find((q) => q.id === "turnaround")?.answer ?? "";
    expect(answer).not.toMatch(/shown on this page/i);
    expect(answer).toContain("Return timing is confirmed separately");
  });

  it("keeps the FAQ ids that analytics events refer to", () => {
    expect(FAQ.map((q) => q.id)).toEqual([
      "what-knives",
      "how-to-pack",
      "turnaround",
      "always-sharp",
      "payment",
      "area",
      "mail-in",
      "gift",
    ]);
  });
});

describe("mail-in and gifts are interest only", () => {
  // Nothing about them may read like something that can be bought or has been set up.
  const PURCHASE =
    /\$\s?\d|\bbuy\b|\bpurchase\b|add to cart|check ?out|book now|order now|pay now|pay today/i;

  it("marks both as coming soon, interest only, with no price or purchase wording", () => {
    for (const [name, way] of [
      ["mail-in", MAIL_IN_WAY],
      ["gift", GIFT_WAY],
    ] as const) {
      const text = JSON.stringify(way).replace(/\\u00b7/g, "·");
      expect(way.status, name).toMatch(/coming soon/i);
      expect(way.status, name).toMatch(/interest only/i);
      expect(text, `${name} reads like a purchase`).not.toMatch(PURCHASE);
    }
  });

  it("says plainly that there is no shipping kit and not to mail knives", () => {
    expect(JSON.stringify(MAIL_IN_WAY)).toMatch(/no shipping kit/i);
    expect(MAIL_IN_WAY.note).toMatch(/do not mail knives/i);
    expect(PREP.mail_in.body).toMatch(/not available yet/i);
    expect(PREP.mail_in.body).toMatch(/do not send knives/i);
    expect(FAQ.find((q) => q.id === "mail-in")?.answer).toMatch(/not yet/i);
  });

  it("presents a gift as a way to pay, not a third way to hand over knives", () => {
    expect(GIFT_WAY.body).toMatch(/way to pay for someone else's sharpening/i);
    expect(GIFT_WAY.body).toMatch(/not a third way/i);
    expect(GIFT_WAY.note).toMatch(/do not need your recipient's details/i);
    expect(FAQ.find((q) => q.id === "gift")?.answer).toMatch(/not selling gifts yet/i);
  });

  it("keeps pickup as the only bookable choice, and no longer says 'No shipping'", () => {
    expect(PICKUP_WAY.status).toMatch(/open for booking/i);
    expect(BRAND.tagline).not.toMatch(/no shipping/i);
    expect(JSON.stringify({ HOW_IT_WORKS, WHY_US })).not.toMatch(/no shipping/i);
    expect(read("src/sections/Hero.tsx")).not.toMatch(/no shipping/i);
    expect(read("index.html")).not.toMatch(/no shipping/i);
  });

  it("gives preparation steps for the customer without claiming how knives are handled", () => {
    expect(PREP.steps.map((s) => s.id)).toEqual(["wash", "wrap", "bag", "door"]);
    expect(JSON.stringify(PREP)).not.toMatch(/\bwe (clean|wash|sanitiz|disinfect|inspect|wear)/i);
  });
});
