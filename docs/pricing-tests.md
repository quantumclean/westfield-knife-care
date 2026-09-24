# Pricing tests

Pricing is a **price version**, not a number in the code. This document
records why each version exists, what it should teach us, and how to add the
next one.

## How a price is computed

`packages/shared/src/pricing.ts`:

```
total = bundle_price + max(0, knives - knives_included) × extra_knife_price
```

The API recomputes the total from the experiment's price version and passes
it to Stripe Checkout as an inline `price_data` line item. Nothing about
price is trusted from the browser, and no Stripe Products or Payment Links
need updating to run a test.

## Price versions

| id        | bundle | knives | per knife (bundle) | extra knife | max | in experiment  |
| --------- | ------ | ------ | ------------------ | ----------- | --- | -------------- |
| price-001 | $39    | 4      | $9.75              | $10         | 12  | experiment-001 |
| price-002 | $49    | 5      | $9.80              | $10         | 12  | experiment-002 |

The two versions deliberately hold the marginal price constant so the test
isolates **anchor and bundle size**, not per-knife value. Most home kitchens
have 3 to 6 knives they actually use; 4 vs 5 asks whether a bigger default
raises order value without hurting conversion.

## Unit economics (fill in from real data)

| item                           | assumption | measured |
| ------------------------------ | ---------- | -------- |
| Sharpening time per knife      | 6 min      |          |
| Pickup + return drive per stop | 12 min     |          |
| Stops per route hour           | 4          |          |
| Consumables per knife          | $0.40      |          |
| Stripe fee per order           | 2.9% + 30¢ |          |
| Contribution per $39 order     | ≈ $30      |          |
| Contribution per $49 order     | ≈ $39      |          |

Track `average_knives` and `time_to_fulfill_hours` from the summary
endpoint; they are the two inputs that move contribution most.

## What to watch per test

1. **Visitor-to-paid rate** per experiment (`visitor_to_paid_rate`).
2. **Revenue per visitor** = `revenue_cents / funnel.page_view`. This is the
   number that decides between a cheaper, higher-converting offer and a
   pricier one.
3. **Average knives per order.** A bundle of 5 should lift it; if orders
   cluster at 3 to 4 knives under price-002, the anchor is too high.
4. **Drop-off between `checkout_started` and `checkout_completed`.** A gap
   wider than 25% points at the price being visible too late (people see the
   total only on Stripe) rather than at the price itself.
5. **Repeat intent by price.** Paying more and still saying "yes" is the
   strongest possible signal.

## Adding a price test

1. Add a `PriceVersion` to `packages/shared/src/experiments.ts` with a new id.
   Do not edit an existing one.
2. Add an `Experiment` that pairs it with an existing or new offer version.
3. Adjust `weight` on live experiments to allocate traffic.
4. Run `pnpm test` (the registry is validated), open a pull request with the
   hypothesis, update the table above.
5. Print material that names a price must carry `?exp=` for that experiment
   so a flyer never shows one price and the page another.

## Tests planned after the launch pair

| version idea                 | hypothesis                                        | success metric                                 |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| $29 / 3 knives               | A lower anchor brings in singles and first-timers | paid rate +30% with revenue/visitor ≥ baseline |
| $12 per knife, no bundle     | Simplicity beats bundle framing                   | average knives ≥ 4 and paid rate ≥ baseline    |
| $59 / 8 knives "whole block" | Families and cooks want everything done at once   | 20% of orders choose it; contribution +$15     |
| Same-day return +$10         | Speed is worth paying for                         | ≥ 25% attach rate                              |
