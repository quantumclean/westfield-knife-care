# Experiment plan

**Goal:** validate demand for a local knife care service in Westfield and
learn which offer, price and acquisition channel produce paying, returning
customers, before spending on routes, equipment or staff.

Everything in this plan maps onto code: experiments live in
`packages/shared/src/experiments.ts`, the funnel in
`packages/shared/src/analytics.ts`, and the measurements in
`GET /api/admin/summary`.

## Phases

| Phase                      | When       | What we do                                                                                                                                       | Exit criterion                                                               |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1. Start simple, test fast | Weeks 1–4  | Launch landing page + flyer. Two services: Sharpen My Knives (paid) and Always Sharp pilot (waitlist). Same fulfilment: pickup, sharpen, return. | 30+ paid orders or 200+ unique visitors per experiment, whichever first      |
| 2. Validate and learn      | Weeks 5–8  | Compare experiments, test turnaround and price, call every first customer, refine copy and process.                                              | A winning experiment with ≥ 3% visitor-to-paid and ≥ 40% "yes" repeat intent |
| 3. Expand and partner      | Months 2–4 | Neighbourhood routes and pickup hubs (shops, gyms, co-ops). Restaurant / exchange program.                                                       | Route days at ≥ 8 pickups each; a partner hub producing ≥ 5 orders/month     |
| 4. Grow and scale          | Months 4+  | Nearby towns, household subscriptions (Always Sharp), partner distribution and corporate/gift.                                                   | Subscription retention ≥ 70% at 3 months                                     |

## Live experiments

| id             | offer     | price     | headline                            | bundle         | hypothesis                                                                                       |
| -------------- | --------- | --------- | ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| experiment-001 | offer-001 | price-001 | Never cook with a dull knife again. | $39 / 4 knives | Households pay $39 for a 4-knife bundle when the pitch is about never cooking with a dull knife. |
| experiment-002 | offer-002 | price-002 | Your knives. Sharp tomorrow.        | $49 / 5 knives | A next-day promise justifies a higher price and converts at least as well as the baseline.       |

Both are weighted 1:1. Extra knives are $10 each in both, so the per-knife
price only differs inside the bundle ($9.75 vs $9.80); the test is really
**speed promise + bundle size** against **plain value**.

## What each experiment must answer

1. **Demand:** unique visitors → CTA clicks → booking opened → booking
   submitted → checkout started → paid. All six steps are recorded per
   experiment and per channel.
2. **Price acceptance:** paid rate and average knives per order. If
   experiment-002 converts within 20% of 001 it wins on revenue per visitor.
3. **Operational reality:** `time_to_fulfill_hours` per order. Experiment-002
   promises next day; if the median exceeds 30 hours the promise is a lie and
   the experiment is paused regardless of conversion.
4. **Retention signal:** `repeat_intent` (asked after return) and
   `actual_repeat_purchase` (observed). Intent is cheap, purchases are truth.
5. **Channel:** `acquisition_channel` × paid orders. Print (flyers, posters)
   versus social versus referral tells us where the next dollar goes.

## Traffic and links

**Print always uses a vanity path, never a bare `?exp=` query string.** A
flyer's QR code must keep showing the exact price printed on it, for as long
as that flyer exists in someone's kitchen drawer — including after the
experiment concludes. Query strings can be dropped by messaging apps,
mistyped, or lost when a link is copied by hand; a path cannot.
`packages/shared/src/flyer-routes.ts` is the registry:

```
https://sharp.example.com/a   → experiment-001 ($39 / 4 knives), source "flyer-a", channel print
https://sharp.example.com/b   → experiment-002 ($49 / 5 knives), source "flyer-b", channel print
```

Once a browser lands on `/a` or `/b`, that pin is permanent for that visitor
(stored in `localStorage`) and is honored by the API forever, even if the
experiment is later paused or concluded — see `selectExperiment` and
`resolveForOrder`. A visitor is never shown a price that doesn't match the
flyer they scanned.

Digital and referral placements that have no fixed price to protect still
use query parameters, same as before:

```
https://sharp.example.com/?src=nextdoor-post-1&ch=social        (random assignment)
https://sharp.example.com/?src=friend&ch=referral               (random assignment)
https://sharp.example.com/?exp=experiment-002&src=ig-story-3&ch=social  (pin a specific test)
```

Rules:

- `exp` pins a visitor to an experiment, same guarantee as a vanity path.
  Use a vanity path instead whenever the placement shows a fixed price.
- `src` is unique per placement (`flyer-a`, `flyer-b`, `poster-coop`,
  `ig-story-3`). Lowercase, hyphens. Add `?src=` on top of a vanity path to
  distinguish two print batches of the same flyer without changing price.
- `ch` is one of `print`, `social`, `referral`, `search`, `direct`,
  `partner`, `other`. If omitted it is inferred from `src`.
- Attribution is first-touch per browser. A repeat visit does **not**
  overwrite it unless the new visit carries `src`, `ch`, or a vanity path.
- Adding a third flyer variant means adding a third vanity path
  (`/c`) in `flyer-routes.ts`, not reusing `/a` or `/b` for a different
  price.

## Sample size

With a baseline of 3% visitor-to-paid, detecting a relative lift of 50%
(3% → 4.5%) at 80% power needs roughly 1,600 visitors per arm. We will not
reach that in weeks 1–4. Decisions in phase 1 therefore rest on:

- direction of the paid rate with at least 15 paid orders per arm,
- revenue per visitor,
- qualitative signal from calling every customer (what made them book,
  what nearly stopped them).

Treat phase 1 as choosing which experiment deserves the phase 2 budget, not
as proving one. Phase 2 continues the winner against a new challenger.

## Decision rules

- **Pause** an experiment when its median `time_to_fulfill_hours` breaks the
  offer's promise for two consecutive care days.
- **Conclude** an experiment when the other arm has ≥ 15 paid orders and at
  least 1.3× revenue per visitor, or after 8 weeks regardless.
- **Never edit** a live offer or price version. Add `offer-003` or
  `price-003`, create `experiment-003`, set the old one to `concluded`.
- Every change to `experiments.ts` is a pull request with the hypothesis in
  the description and this file updated.

## Backlog of next experiments

| candidate                                | variable      | why                                                       |
| ---------------------------------------- | ------------- | --------------------------------------------------------- |
| $29 / 3 knives                           | price         | lower entry point for singles and small kitchens          |
| "Sharpened by hand, guaranteed" headline | offer / trust | tests craftsmanship vs convenience framing                |
| Same-day return for +$10                 | price add-on  | measures willingness to pay for speed directly            |
| Neighbour referral: $10 off both         | acquisition   | referral channel cost vs print                            |
| Always Sharp at $19/month for 2 swaps    | subscription  | first priced test of the swap model with waitlist members |

## Weekly review

Every Monday, run `GET /api/admin/summary` (see `docs/operations.md`), paste
the table into the tracking sheet, and answer three questions: which arm is
ahead, what broke operationally, what did customers say. Update this file
when a decision is taken.
