# Westfield Knife Care: UX and customer-experience review (pickup, mail-in, gifting)

Reviewed 2026-10-14 against `main` at commit `467d1a9`. File and line references are to that commit.
This was a read-only review: no source files, deployments or databases were changed. This document
is the only artifact added to the repository.

**Method.** I read the web app, shared content and schemas, the docs, and the flyer data. I also
built a copy of the site outside the repo and screenshotted it at 390, 320 and 1280px with mocked
API calls, so the mobile measurements below come from real renders. I did not query live data, so
turnaround figures and the production Apple Maps token state are unchecked.

**Biggest finding.** The repo implements only local pickup and return. There is no mail-in and no
gifting anywhere in the code, schema or copy. Several things on the site actively contradict adding
them: "No shipping", "Westfield" as the only town, and a gift flow that would need different order
data. Pricing and checkout can stay untouched, but only if mail-in and gifting launch as demand
tests first (see section 3).

**Assumptions.**

- "Autocomplete" means the Apple Maps address search, plus the native browser-autofill attributes.
- `docs/launch-freeze.md` is in effect. Every visible change below is tagged **[exception]** (needs
  an owner decision during the freeze) or **[post-freeze]** (wait until the experiments conclude, or
  run it as a new experiment). The 8-week backstop falls around 2026-11-19.

## 1. Brand message and visual direction

**What works.** The headline "Good food starts with a sharp knife" is warm and clear. The price and
next-pickup ticket in the hero is excellent. The booking sheet is well built.

**What doesn't fit.**

- The butter-yellow hero, cartoon fruit and "Chop chop. Let's cook!" sticker read as friendly and a
  bit kid-kitchen. That suits everyday owners. Enthusiasts, and gift buyers spending on someone they
  care about, look for quiet competence. They see no knife close-ups, no person, and no description
  of what happens to the blade.
- The only real photo (`apps/web/public/images/oak-kitchen.webp`) looks stylised, and
  `apps/web/public/images/README.md` doesn't document where it came from. Confirm it is licensed and
  is not presented as the owner's kitchen.
- The cutting-board toy is charming but proves nothing about the service.

**Recommended message.** Keep "Good food starts with a sharp knife" as the emotional line. Support
it with three promises the business can actually keep:

1. **We show you every step.** Prep, handoff, sharpening and return are all explained.
2. **The price is the price.** The total is shown before you pay.
3. **A real person answers.**

| Audience       | Safe line                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Everyday owner | "A fresh edge for your kitchen. We handle the rest."                                             |
| Enthusiast     | "Tell us about your knives. We'll tell you exactly what we'll do." (only once you can honour it) |
| Gift buyer     | "Give someone a fresh edge."                                                                     |

**Visual direction.** Keep the oak, forest and tomato palette, which is distinctive. Move the hero
from saturated butter to a cream/oak paper background with butter as an accent. Replace or
supplement the illustration with owner-shot photos: an edge close-up, an intake tag, hands wrapping
a blade. Keep illustration for the steps. This is a design judgment to A/B test after the freeze,
not a measured improvement.

## 2. Ideal homepage section order

Today the order is Hero, How it works (with film), Pricing, FAQ, Footer. Recommended:

1. **Header:** How it works, Pricing, Gift, FAQ.
2. **Hero:** headline, ZIP check, price and next-pickup ticket.
3. **Three ways to sharpen:** Pickup and return (live), Mail-in (waitlist until real), Gift (request
   until real).
4. **How pickup works:** three steps, plus "Before we arrive".
5. **What happens to your knives:** intake, sharpening, return. Include what is and isn't
   sharpened. Only verified facts go here.
6. **Pricing ticket:** what's included, extra knives, serrated and ceramic policy.
7. **Film:** shorter, lazy-loaded, after pricing.
8. **FAQ:** grouped by path, with packing and return questions first.
9. **Always Sharp pilot:** its own band. It is currently a footnote under pricing.
10. **Footer:** policies, not just privacy.

On mobile, "How it works" is 1,414px tall (29% of a 4,896px page) for three one-line steps plus a
film. Condense it.

## 3. Customer journeys

| Step    | **Pickup and return** (live)                    | **Mail-in** (new)                           | **Gift** (new)                            |
| ------- | ----------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Entry   | Hero ZIP check, then book                       | Hero "Not nearby? Mail it in"               | Nav "Gift"                                |
| Gate    | ZIP in service area (client-side `isServedZip`) | None (any US address)                       | Recipient's ZIP decides pickup or mail-in |
| Commit  | Knives and day, address, pay (unchanged)        | Kit request or pay (needs its own price)    | Recipient, message, send date             |
| Prep    | Wash, guard, box, label                         | Kit arrives, pack from the kit instructions | Recipient gets the same prep guide        |
| Handoff | Door, 8am to 12pm window                        | Carrier drop-off with tracking              | Recipient picks day                       |
| Return  | Doorstep                                        | Return label                                | Same as recipient's path                  |
| Today   | Works                                           | Absent                                      | Absent                                    |

**Out-of-area problem today.** A visitor only learns they are out of area at the ZIP field, at the
bottom of step 2, after typing name, email and phone (`apps/web/src/forms/BookingForm.tsx:638-651`).
Move the check to the hero. `SERVICE_AREA` already maps ZIP to town, so town and state can also be
filled automatically, dropping two fields from step 2.

**Town default risk.** `apps/web/src/lib/draft.ts:41` pre-fills the town as "Westfield", so a
Cranford customer can submit Cranford's ZIP with Westfield as the town. Derive it from the ZIP
instead.

**To preserve pricing and checkout, launch mail-in and gift as waitlist/intent tests.** A real gift
flow needs recipient fields and probably a voucher. Real mail-in needs a non-NJ address, a kit, two
shipping legs and a new price. Both change order data and checkout, which is a separate reviewed API
change. Reuse the waitlist form: add "Gift" and "Mail-in" to the interest options
(`SERVICE_INTERESTS` in `packages/shared/src/types.ts`) and count requests before building. This
matches the repo's own validate-first approach in `docs/experiment-plan.md`. The existing $39/4
price cannot absorb two-way postage and a kit, so do not reuse it for mail-in.

**Gift specifics.** The gift buyer isn't at the address, so don't autofill the buyer's own address
into the recipient fields. Use `autocomplete="off"` or sectioned tokens on those fields. Allow a
message and a send date. Let the recipient choose the pickup day and knife count.

## 4. Safe cleaning, packaging and return instructions

Everything below is **draft copy for the owner to confirm against the real process.** None of it
exists on the site today beyond one FAQ line and a post-payment thank-you checklist.

**Problems with today's guidance.**

- "Wrap in a towel or cardboard sleeve and leave in a bag at your door" is the only advice. It is
  shown after payment (`apps/web/src/thanks.tsx:312-332`) or buried in a collapsed FAQ.
- A towel and a bag are weak protection against a blade cutting through, and the bag sits outside
  unattended for up to four hours.
- There is nothing on return handling, and nothing about what happens if the bag isn't found.

**Before pickup** (show in booking step 1, the FAQ and the confirmation):

1. Wash and dry each knife by hand.
2. Put each blade in a rigid guard, or a folded cardboard sleeve taped shut. A towel alone isn't
   enough.
3. Put guarded knives in a small sturdy box or a bag you can close. Don't leave knives loose in a
   bag.
4. Label it with your name, order number and "Sharp knives".
5. Put it where we can see it and out of the rain. Tell us where in the notes.
6. Unsure about an heirloom, serrated, ceramic or loose-handled knife? Tell us first.

**When your knives come back:**

1. Open the package with the blades pointing away from you.
2. Give each knife a wash before first use. This is a sensible default, but it is the owner's call
   based on the actual process.
3. Hand wash, not dishwasher. Store with a guard.

**Mail-in (when real).** State exactly what is in the kit (rigid box, blade guards, order slip,
prepaid label). Never write "safe shipping", "insured" or "guaranteed" unless that is contractually
true.

**Staff-side suggestions.** Tag each household's knives at intake, count them, photograph on receipt
as a damage baseline, and wear cut-resistant gloves.

**Test suite note.** `apps/web/test/copy-claims.test.ts:62` pins the exact thank-you sentence, so
changing it means updating that test.

## 5. Autocomplete improvements

**Current behaviour** (`apps/web/src/forms/AddressSuggestions.tsx`, `BookingForm.tsx:583`): the
feature only shows when `VITE_APPLE_MAPS_TOKEN` is set, and I could not tell whether production has
it. A "Find address with Apple Maps" button must be tapped first. It reveals a separate search field
above the manual street field, so two address inputs sit on screen.

Problems and fixes:

1. **Extra tap plus duplicate field.** Show one prominent "Find your address" field first, with a
   "Can't find it? Enter manually" link. After a selection, show a confirmed address card with an
   Edit link. Collapse the manual fields until needed.
2. **Brand-led label.** "Find address with Apple Maps" tells customers about the vendor, not the
   benefit. Use "Find your address".
3. **Privacy disclosure is thin.** `apps/web/src/sections/PrivacyPanel.tsx` never mentions Apple. The
   only note is the small hint under the search field. `docs/proposals/phase-2-booking-ux.md` says
   the notice must say so. Add one line at the point of use: "Typing here sends your search to Apple
   Maps."
4. **Unit and drop-off location are buried** in a collapsed "Apartment or notes" section
   (`BookingForm.tsx:654`). Unit number and "where should we look for the bag?" are the biggest
   causes of a missed door pickup. Make them visible and optional.
5. **Service-area awareness.** The search already biases toward Westfield
   (`apps/web/src/lib/apple-maps.ts:12`) and limits to US addresses, but that is only a hint.
   Out-of-area is caught after selection, which works. A "we serve this town" cue beside the field
   would be better.
6. **Native autofill is solid.** The `autocomplete` attributes are all present. Consider
   `autocapitalize` and `spellcheck="false"` on the street line, and sectioned tokens for the future
   recipient address.

## 6. The five highest-impact UI changes

| #   | Change                                                                                       | Files                                                                                                                                                                   | Tier          |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | Truthful hero plus a "three ways" chooser: Pickup live, Mail-in and Gift as intent paths     | `Hero.tsx:26-29`, new `sections/Services.tsx`, `app.tsx`, `packages/shared/src/content.ts` (`BRAND.tagline`, `HOW_IT_WORKS`, `WHY_US`), `Footer.tsx`, `index.html` meta | [exception]   |
| 2   | ZIP-first service check, with town and state auto-filled from `SERVICE_AREA`                 | `Hero.tsx`, `BookingForm.tsx:638-651`, `lib/draft.ts:41`                                                                                                                | [exception]   |
| 3   | Handoff and return guide in step 1 and the confirmation                                      | `BookingForm.tsx:489`, `content.ts` (FAQ `how-to-pack`), `thanks.tsx:312-332`, `art/ready.ts`, `test/copy-claims.test.ts:62`                                            | [exception]   |
| 4   | Address step rework: single-field search, visible unit and drop-off, point-of-use disclosure | `AddressSuggestions.tsx`, `BookingForm.tsx:583-681`, `styles.css:3-58`, `PrivacyPanel.tsx`                                                                              | [exception]   |
| 5   | "How we handle your knives" trust section and policies                                       | new `sections/Trust.tsx`, `Pricing.tsx:65-71`, `Footer.tsx`, `test/copy-claims.test.ts`                                                                                 | [post-freeze] |

Paths without a prefix are under `apps/web/src/` (tests under `apps/web/test/`).

**Smaller mobile note.** At 320x640 the hero CTA is clipped: its box runs from 629px to 688px on a
640px viewport. At 390x844 it is fully visible. A tighter hero on narrow phones fixes it. The sticky
CTA also appears after scroll, which works.

**Trust gap for change 5.** There is no owner name or face, no damage or loss policy, and no
cancellation terms before payment. Types show refunds exist operationally, but
`apps/web/test/copy-claims.test.ts:19` bans the word "refund" everywhere. That regex would also
block an honest policy page, so allow-list a dedicated policy page.

## Unverified claims, challenged

| Claim                                                                     | Where                                                    | Verdict                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Back at your door within 48 hours", "fast", "professionally sharpen"     | Flyer A (`marketing/flyers/data.mjs:17-21`), `offer-001` | **Unverified.** The site test bans these words, but the printed flyer carries them.                                                                                                                                                                             |
| "We pick up today, sharpen tonight, return tomorrow" and "Sharp tomorrow" | Flyer B, `offer-002`                                     | **Contradicted by the code.** `packages/shared/src/care-days.ts:15-19, 42` runs Tue/Thu/Sat only, with a minimum lead of a full day. Same-day pickup is impossible.                                                                                             |
| Next-day promise vs "Return timing is confirmed separately"               | Flyer B vs the site                                      | **Inconsistent at the landing moment.** The visitor sees "tomorrow" on paper and "confirmed separately" on screen.                                                                                                                                              |
| Turnaround data                                                           | `time_to_fulfill_hours`                                  | Not queried. `docs/experiment-plan.md:40-42` says to pause if the median passes 30 hours. Check `/api/admin/summary` before this runs longer. That metric measures pickup to return, not booking to return.                                                     |
| "No shipping", "Westfield" only                                           | Hero, tagline, step 1, footer, meta                      | **True now, false once mail-in exists.** It also understates six served towns.                                                                                                                                                                                  |
| Serrated and ceramic "case by case"                                       | FAQ                                                      | Customers pay a flat price upfront. Say whether those knives cost the same.                                                                                                                                                                                     |
| Sanitisation / "cleaned"                                                  | Nowhere in the repo                                      | **Don't add it.** A web search found sanitiser and disinfectant claims are regulated for products under EPA/FIFRA. How that applies to services was not confirmed, so check with a lawyer first. Say what is actually done, such as "wiped down", only if true. |
| Mail-in "protective kits" / "safe shipping"                               | Not yet written                                          | **Unverified.** USPS Publication 52 has a "Knives and Sharp Instruments" section (4.4). The specific rules were not read, so check them and each carrier's terms before launch.                                                                                 |
| Service availability                                                      | Hero, FAQ                                                | **Reasonably honest.** Care days come from the server and booking fails closed. The ZIP list is an owner decision, and ZIPs don't match town borders exactly.                                                                                                   |

**Market context** (search snippets, unverified): mail-in competitors quote roughly 5 to 10 days
total and about $11 per knife or $57 for four. A realistic mail-in promise is days, not "tomorrow".

**Not checked.**

- Whether production has an Apple Maps token.
- Real turnaround data.
- The real sharpening method. `docs/experiment-plan.md` treats equipment as future spending.
