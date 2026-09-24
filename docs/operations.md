# Operations runbook

One person can run phase 1 with this routine and a terminal. Replace
`$API` with `https://sharp.example.com/api` and set `ADMIN_API_KEY` from SSM.

```sh
export API=https://sharp.example.com/api
export ADMIN_API_KEY=$(aws ssm get-parameter --with-decryption --name /wkc/prod/admin_api_key --query Parameter.Value --output text)
alias wkc='curl -sS -H "x-admin-key: $ADMIN_API_KEY" -H "content-type: application/json"'
```

## Care day (Tue / Thu / Sat by default)

Care days are configured in `packages/shared/src/care-days.ts`
(`DEFAULT_CARE_DAY_CONFIG`). Customers book at least one full day ahead.

**The evening before**

```sh
wkc "$API/admin/orders" | jq -r '.orders[] | select(.payment_status=="paid" and .pickup_status=="scheduled" and .care_day=="2026-09-26") | [.id, .customer.name, .customer.address.line1, .number_of_knives, .notes] | @tsv'
```

Plan the route from that list. Text each customer the pickup window.

**On pickup**

```sh
wkc -X PATCH "$API/admin/orders/<id>" -d '{"pickup_status":"picked_up"}'
```

Missed pickup (nobody home, no bag):

```sh
wkc -X PATCH "$API/admin/orders/<id>" -d '{"pickup_status":"missed","notes":"No bag at door; texted to rebook"}'
```

**On return**

```sh
wkc -X PATCH "$API/admin/orders/<id>" -d '{"return_status":"returned"}'
```

This stamps `returned_at` and computes `time_to_fulfill_hours`. Then send the
follow-up text with the feedback link:

```
Your knives are back at your door. Would you use Westfield Knife Care again?
https://sharp.example.com/thanks?order=<id>&feedback=1
```

The customer's answer lands in `repeat_intent`. If they tell you in person
or by text instead:

```sh
wkc -X PATCH "$API/admin/orders/<id>" -d '{"repeat_intent":"yes"}'
```

## Weekly review (Monday)

```sh
wkc "$API/admin/summary" | jq '.experiments[] | {experiment_id, funnel, orders_paid, revenue_cents, visitor_to_paid_rate, average_time_to_fulfill_hours, repeat_intent, by_channel}'
```

Paste into the tracking sheet and apply the decision rules in
`docs/experiment-plan.md`. Export raw data when needed:

```sh
wkc "$API/admin/orders" | jq -r '.orders[] | [.created_at,.experiment_id,.price_version,.source,.acquisition_channel,.number_of_knives,.quote.total_cents,.payment_status,.pickup_status,.return_status,.time_to_fulfill_hours,.repeat_intent,.is_repeat_customer,.actual_repeat_purchase] | @csv' > orders.csv
wkc "$API/admin/waitlist" | jq -r '.entries[] | [.created_at,.experiment_id,.cadence,.service_interest,.source] | @csv' > waitlist.csv
```

## Payments

- Orders are `pending` until Stripe's webhook arrives. A customer who paid
  but shows `pending` for more than a few minutes means the webhook is
  misconfigured: check the Stripe dashboard → Developers → Webhooks, and
  CloudWatch logs (`log_group_name` output) for `webhook.rejected`.
- Refund from the Stripe dashboard; the `charge.refunded` webhook sets
  `payment_status = refunded`.
- Never charge outside Stripe. Cash customers get no order record and no
  experiment data.

## Changing what customers see

| change                       | where                                   | needs deploy |
| ---------------------------- | --------------------------------------- | ------------ |
| price, bundle size, headline | `packages/shared/src/experiments.ts`    | yes          |
| traffic split                | `weight` on the experiment              | yes          |
| care weekdays, lead time     | `packages/shared/src/care-days.ts`      | yes          |
| FAQ, steps, trust points     | `packages/shared/src/content.ts`        | yes          |
| Stripe keys, admin key       | SSM parameters, then redeploy           | yes          |
| GA4 id                       | `VITE_GA4_MEASUREMENT_ID` repo variable | yes          |

"Needs deploy" is a push to `main`; the workflow takes about five minutes.

## Incidents

- **Site down:** CloudFront serves the bucket; check the last deploy run
  and the `cloudfront_distribution_id` output. Re-run the deploy workflow.
- **API 5xx:** the `wkc-prod-api-errors` alarm fires above 3 errors in 5
  minutes. Read the log group; every error logs `request.error` with a
  stack.
- **Lost the admin key:** overwrite the SSM parameter and redeploy.
- **Rollback:** `git revert` the offending commit and push. The bucket keeps
  30 days of object versions if a manual restore is ever needed.
