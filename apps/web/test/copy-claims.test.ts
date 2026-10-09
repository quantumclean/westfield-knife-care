import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, FAQ, HOW_IT_WORKS, WHY_US } from "@wkc/shared";

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
  "index.html (title, description, social tags)": read("index.html"),
  "src/forms/BookingForm.tsx": read("src/forms/BookingForm.tsx"),
  "src/forms/PilotForm.tsx": read("src/forms/PilotForm.tsx"),
  "src/thanks.tsx": read("src/thanks.tsx"),
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

  it("keeps the FAQ ids that analytics events refer to", () => {
    expect(FAQ.map((q) => q.id)).toEqual([
      "what-knives",
      "how-to-pack",
      "turnaround",
      "always-sharp",
      "payment",
      "area",
    ]);
  });
});
