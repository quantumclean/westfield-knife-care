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

Each physical or digital placement gets its own link. The QR code and the
short link must encode all three parameters:

```
https://sharp.example.com/?exp=experiment-001&src=flyer-v1-qr&ch=print
https://sharp.example.com/?exp=experiment-002&src=poster-gym-main&ch=print
https://sharp.example.com/?src=nextdoor-post-1&ch=social        (random assignment)
https://sharp.example.com/?src=friend&ch=referral               (random assignment)
```

Rules:

- `exp` pins a visitor to an experiment. Use it on print so each flyer
  version is a clean cell. Leave it off online so the site splits traffic.
- `src` is unique per placement (`flyer-v1-qr`, `flyer-v2-qr`, `poster-coop`,
  `ig-story-3`). Lowercase, hyphens.
- `ch` is one of `print`, `social`, `referral`, `search`, `direct`,
  `partner`, `other`. If omitted it is inferred from `src`.
- Attribution is first-touch per browser. A repeat visit from a different
  link does **not** overwrite it unless the new link carries `src`.

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
