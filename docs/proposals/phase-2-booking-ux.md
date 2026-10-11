# Phase 2 proposal: booking and confirmation UX

**Status: partly implemented (booking UX v2, 2026-10-10).** Items 1
(quantity chips plus a 6+ stepper), 6 (short first step, sticky total and
action, draft kept across a cancelled checkout) and the frontend half of 5
(readable state labels, backoff polling) shipped, along with the mobile
menu, skip link, stronger focus rings and thank-you headings from the
audit list. Items 2, 3 (step two: address provider), 4 and the
`payment_mode` field of 5 remain proposals.

These changes alter what visitors see, so under `docs/launch-freeze.md` they
wait until experiment-001 and experiment-002 conclude, or ship as a new,
reviewed experiment. None of them touches the pricing calculation
(`quoteOrder` in `packages/shared/src/pricing.ts`), the experiment registry or
assignment, the Stripe backend or production configuration. Where an item needs
an API or data-model change, that is called out so it gets its own review.

| #   | Feature                | Recommendation                                                          | API change?                       |
| --- | ---------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| 1   | Knife quantity         | Show 1 to 5 as quick choices, plus a "6+" option with a number field    | No                                |
| 2   | Knife types and brands | Common choices plus "Other: type your own"; always optional             | Only if stored as fields          |
| 3   | Address entry          | Browser autofill first; add suggestions from a reputable provider later | No (provider call from the page)  |
| 4   | Text notifications     | Optional SMS updates with explicit consent and opt-out handling         | Yes: consent record, SMS provider |
| 5   | Payment confirmation   | Clearly distinguish test, pending, paid and failed states               | Yes: one field on the order view  |
| 6   | Booking form           | Keep the first step short; collect further details only when needed     | No                                |

Suggested order: 5 (it removes ambiguity), then 6 and 1 together (one form
rework, measured against today's funnel), then 3, 2 and 4.

## 1. Knife quantity: 1 to 5 plus "6+"

**Today.** `BookingForm.tsx` renders a select of 1 to `price.max_knives` (12),
labelling each count up to the bundle size "(bundle)". The bundle is 4 knives in
price-001 and 5 in price-002, and the schema allows up to 50 while `quoteOrder`
enforces the price version's maximum.

**Proposal.** Five large tap targets for 1 to 5, with the bundle size marked,
then "6+" which reveals a number field limited to `price.max_knives`. The quote
still comes from `quoteOrder`; the page only changes how the count is entered.

**Risks and decisions.**

- The bundle differs per experiment, so the highlighted choice differs; test
  both.
- Quantity is part of what is being measured (average knives per order), so
  change it only after the freeze or as its own experiment.
- Ask the owner what happens above 12: today there is no way to book more.

## 2. Common knife types and brands, with "Other"

**Today.** There are no knife fields. Customers describe knives in free-text
`notes` (500 characters). The FAQ asks for serrated and ceramic knives to be
mentioned there.

**Proposal.** Optional chips for common types (chef, santoku, paring, bread,
carving, serrated) and a short brand list ending in "Other: type your own". No
brand selection is required to book. Serrated or ceramic selections should
show the existing "handled case by case" wording from the FAQ.

**Options.**

1. Fold the selection into `notes` as a line of text. No API change, but not
   queryable.
2. Add optional fields to the order schema, D1 migration and admin export.
   Queryable, but it is an `apps/api` and data-model change needing review.

**Owner decisions.** Which brands to list (do not imply endorsement or
partnership); whether pricing ever depends on type (it does not today, and
should not change in this work).

## 3. Address entry: autofill now, suggestions later

**Today.** Fields carry `autocomplete` tokens (`name`, `email`, `tel`,
`address-line1`, `address-line2`, `address-level2`, `address-level1`,
`postal-code`). State is a two-character text input, which browsers may not fill
reliably from a profile that stores "New Jersey" (untested here).

**Proposal, step one (no provider).** Make autofill dependable: a state select
(defaulting to NJ) instead of free text; `autocapitalize` and `inputmode`
hints; keep the `name` attributes stable. Test with Chrome, Safari and iOS
autofill.

**Proposal, step two (suggestions).** Type-ahead on the street line from a
US-capable address provider, with the form fully usable when the provider is
down or blocked.

| Criterion            | Why it matters here                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| US address quality   | Pickup is door-to-door; a wrong address costs a missed route stop                                           |
| Storage terms        | Addresses are saved with the order; some providers restrict storing or caching results                      |
| Key handling         | A browser key must be restricted by referrer and quota. Never put an unrestricted key in a `VITE_` variable |
| Privacy              | Partial addresses leave the site as the customer types; the privacy notice must say so                      |
| Cost at pilot volume | Per-request pricing; debounce and a minimum of three characters                                             |
| Failure mode         | Provider outage must not block booking                                                                      |

Candidates to evaluate (no choice is made here): Google Places, Mapbox Search,
Smarty (US autocomplete), Radar, Geoapify. If analytics is later given a
Content-Security-Policy, the provider's origin must be added to `connect-src`.

**Service area.** The form accepts any state, city and 5-digit ZIP, and the API
does not restrict them. Once the owner supplies the ZIP codes served, add a
visible "outside our area, join the waitlist" message and, separately, API
validation.

## 4. Optional SMS notifications

**Today.** The form says "For pickup and return texts" and the thank-you page
says "we will text you", but `docs/operations.md` has the operator texting by
hand and phone is optional. There is no automated SMS and no consent record.

**Proposal.** A separate, unchecked checkbox beside the phone field: "Text me
pickup and return updates", with disclosure of what is sent, roughly how often,
"message and data rates may apply", "reply STOP to opt out, HELP for help", and
links to terms and privacy. It must not be pre-ticked or bundled with payment
or marketing consent.

**Needs (all outside this frontend change).**

- Consent record: phone, timestamp, wording version and source, stored with the
  order or waitlist entry.
- An SMS provider and US sender registration (A2P 10DLC), which takes lead time.
- Opt-out handling: honour STOP and HELP replies, store the opt-out, and make
  operators' tooling skip opted-out numbers.
- Transactional messages (pickup window) kept separate from any marketing.

**Owner decisions.** Whether phone becomes required for pickup, or the "we will
text you" copy changes to reflect email or manual texting; who sends the texts;
legal review of the consent wording before launch.

## 5. Payment confirmation states

**Today.** `payment_status` is one of `pending`, `paid`, `failed`, `expired`,
`refunded`. The thank-you page handles `paid` and `pending`, and shows any other
status as "This booking was not paid (failed)" with the raw word. Outside
production the local API simulates checkout and leaves orders `pending`
forever, which looks like "waiting for the webhook". The public order view
carries no hint that a payment was simulated or made with a test key.

**Proposal.** One clear message per state:

| State                        | Heading and body                                                    |
| ---------------------------- | ------------------------------------------------------------------- |
| Test or simulated (non-prod) | "Test booking. No real payment was taken." with a visible badge     |
| Pending, still polling       | "Confirming your payment…" with a spinner and live-region text      |
| Pending, polling gave up     | Already in this branch: check again, order number, do not pay twice |
| Paid                         | "Booked" with day, total and what happens next                      |
| Failed, expired              | "Payment did not go through" with a link back to book again         |
| Refunded                     | "Refunded" with the amount and the order number                     |

Show readable labels, never the raw status word. Back off polling instead of a
fixed two seconds.

**Needs.** The only part that cannot be done in the frontend is telling test
from live: add something like `payment_mode: "simulated" | "test" | "live"` to
`publicOrderView` in `apps/api/src/services/orders.ts`. That is a reviewed API
change.

## 6. Mobile booking flow and unnecessary scrolling

**Measured** on the production build, headless Chrome with touch emulation:

| Viewport | Modal height | Form scroll length | Screens of scrolling |
| -------- | ------------ | ------------------ | -------------------- |
| 375x812  | 780 px       | 1,715 px           | about 2.2            |
| 320x640  | 608 px       | 1,790 px           | about 2.9            |

The form has 11 inputs (knives, pickup day, name, email, phone, street,
apartment, city, state, ZIP, notes). The total and the pay button are at the
very bottom, so the price is off screen while the customer types.

**Proposal.**

1. Keep the first step short: knives, pickup day, name, email, street address.
   Phone, apartment, notes and (with autofill) city, state and ZIP are
   collected next or hidden behind "Add details" when not needed.
2. A sticky footer showing the total and the pay button so price and action
   stay visible while scrolling.
3. Full-width tap targets (at least 44 px), correct `type`, `inputmode`,
   `enterkeyhint` and `autocomplete` on every field.
4. Persist what the customer typed if they cancel at Stripe, so coming back to
   `#book` does not start over.
5. Shorter hero image on small screens so the primary CTA sits higher.

**How to judge it.** `form_error` already records which fields failed and
`booking_opened`, `booking_submitted` and `checkout_started` give the funnel.
Take the current rates as the baseline before changing anything. The registry
models copy (offers) and numbers (prices), not layout, so a form variant would
need its own assignment mechanism, or a before/after comparison after the
freeze with the caveat that it is not a controlled test.

## Related items found during the audit

Visible changes that are not part of the six above but are waiting on the same
freeze: a mobile menu (the navigation is hidden below 720 px), a skip link,
stronger input focus rings (the accent green is about 2:1 on white), spacing
below the sticky header when jumping to sections, the stray divider lines in
the stacked "How It Works" steps on mobile, and a heading on every thank-you
state. Meta tags that need the production domain or a social image (canonical,
`og:url`, `og:image`, a neutral `og:description`) wait on owner input.
