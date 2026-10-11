# Reading the visitor insights report

`GET /api/admin/insights` turns the first-party events and the order records into one
aggregate report per experiment arm. It needs the admin key, like every `/api/admin` route.

```bash
export API=https://sharp.usabiology.com/api      # or the staging host
alias wkc='curl -sS -H "x-admin-key: $ADMIN_API_KEY"'

# Readable report since the v2 analytics release (use the deploy time from launch-freeze.md)
wkc "$API/admin/insights?since=2026-10-12T00:00:00Z&format=markdown"

# The same as JSON, for jq or a spreadsheet
wkc "$API/admin/insights?since=2026-10-12T00:00:00Z" | jq '.arms[] | {experiment_id, funnel, outcomes}'
```

Parameters:

- `since` and `until`: ISO times, with `until` exclusive. They apply to events, orders
  and waitlist sign-ups.
- `min_count`: suppression threshold for breakdown rows, 1–100, default 5.
- `format=markdown`: return Markdown instead of JSON.

## The six questions

| question                                              | where to look                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Where did visitors come from?                         | `by_channel` and `by_source` per arm (first touch: flyer, social, search…)                                           |
| Did they engage?                                      | `engagement.bounce_rate`, `section_reach`, `scroll_depth`, `video`, `faq_openers`; `funnel.engaged`                  |
| Where do booking steps fail?                          | `drop_offs` (largest losses, with the weakest device), `booking.closed_at`, `booking.form_error_fields` and `_kinds` |
| Does address autocomplete help?                       | `booking.address_suggestions` and `submit_rate_with_suggestion` vs `_without_` (needs PR #28 and Maps enabled)       |
| Do mobile visitors struggle more?                     | `by_device` and `by_viewport` (opened, submitted, paid, paid / visitor); `worst_device` on each drop-off             |
| Which experiment increases **confirmed paid** orders? | `outcomes.orders_paid`, `paid_per_visitor` and `revenue_per_visitor_cents` per arm, plus the side-by-side table      |

## How the numbers are counted

- **Visitors** are unique random browser ids. One person on a phone and a laptop counts
  twice; a visitor who cleared site data or used "Delete my analytics data" starts again.
- **Funnel**, in unique visitors per step:
  `visited → engaged → cta_click → booking_opened → booking_details → booking_submitted → checkout_started → paid`.
  - `engaged` means the visitor interacted (a button, the FAQ, the film), scrolled at
    least 50%, or stayed 10 seconds or more.
  - `booking_details` means they started entering contact details.
  - `paid` counts orders with payment status paid (including later refunds, as in
    `/summary`), set by Stripe's webhook.
- **Bounce rate** is the share of landing page loads with no interaction, under 50%
  scroll, and under 10 seconds visible (or no time recorded).
- **Duplicates.** Once-per-view events are de-duplicated again in the report, and the count
  dropped appears as `duplicates_ignored`. Retried batches are stored only once.
- **Suppression.** In `by_*` rows, numbers are `null` (`<min` in Markdown) when the row has
  fewer than `min_count` visitors. Arm totals are never suppressed.
- **Revenue** is net of Stripe refunds. Paid orders by device or viewport are matched to the
  device their browser first reported; orders without a matching browser id are `unknown`.
- **Window.** Events are kept 90 days. `events_truncated: true` means more than 200,000
  events fell in the window; narrow it.
- **Cost of a report.** The report reads every event in the window, so a long window costs
  D1 reads and Worker CPU time. The Workers Free plan's per-request CPU limit can cut off a
  large report (as it can `/summary`). Use `since`/`until` to report a week at a time, or
  run it on the Workers Paid plan.

## Reading it well

- Compare arms over the **same window** and only after the v2 release time. Earlier rows
  have no device or view data.
- Wave 1 numbers are small. A single paid order moves `paid_per_visitor` a lot. Use the
  decision rules in `docs/experiment-plan.md`, not one week's report.
- Act on drop-offs:
  - **large `booking_opened → booking_details` loss:** the price or day choice is the
    problem
  - **large `booking_details → booking_submitted` loss, with `form_error_fields`:** a
    specific field is the problem (for example `phone` with `format`)
  - **large `checkout_started → paid` loss:** Stripe checkout or cold feet; check
    `booking.checkout_cancelled_returns`
- `health.client_errors` with `api:booking:5xx` or `chunk` means real failures. Check the
  Cloudflare logs for that time.
- GA4 (if ever enabled) sees only opted-in visitors, so its numbers will be far lower. Do
  not compare them with these.
