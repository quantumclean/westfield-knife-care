# Analytics events

Two sinks receive the same events:

1. **First-party** `POST /api/events`, stored in DynamoDB with the visitor's
   experiment and attribution. This is the source of truth for the experiment
   summary and survives ad blockers.
2. **Google Analytics 4**, when `VITE_GA4_MEASUREMENT_ID` is set. Useful for
   audience and device breakdowns; not used for decisions.

Event names are defined once in `packages/shared/src/analytics.ts` and sent
from `apps/web/src/lib/analytics.ts` via `track(name, props)`.

## Context on every event

| field                 | source                                                  |
| --------------------- | ------------------------------------------------------- |
| `visitor_id`          | random id in localStorage, created on first visit       |
| `experiment_id`       | assigned experiment (see `docs/experiment-plan.md`)     |
| `offer_version`       | resolved from the experiment by the API                 |
| `price_version`       | resolved from the experiment by the API                 |
| `source`              | `?src=` / `utm_source` / referrer host / `direct`       |
| `acquisition_channel` | `?ch=` / `utm_medium` / inferred from source / `direct` |
| `page`                | pathname (`/` or `/thanks`)                             |
| `created_at`          | server time                                             |

Events expire after 180 days (DynamoDB TTL). Orders and signups do not.

## Catalog

| event                | when                                                                                   | props                                                                    | funnel step |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------- |
| `page_view`          | page load of `/` or `/thanks`                                                          |                                                                          | 1           |
| `cta_click`          | any Sharpen / Pilot button                                                             | `cta`: sharpen \| pilot; `location`: hero \| nav \| pricing \| deep-link | 2           |
| `booking_opened`     | booking dialog shown                                                                   | `location`                                                               | 3           |
| `booking_submitted`  | booking form passed client validation                                                  | `knives`, `care_day`, `total_cents`                                      | 4           |
| `checkout_started`   | order created, redirecting to Stripe                                                   | `order_id`, `total_cents`                                                | 5           |
| `checkout_completed` | thank-you page confirms `payment_status = paid` (once/order)                           | `order_id`, `total_cents`                                                | 6           |
| `pilot_opened`       | waitlist dialog shown                                                                  | `location`                                                               |             |
| `pilot_submitted`    | waitlist entry saved                                                                   | `cadence`, `interest`                                                    |             |
| `faq_opened`         | an FAQ item expanded                                                                   | `question` (FAQ id)                                                      |             |
| `form_error`         | client validation failed                                                               | `form`: booking \| pilot; `fields`                                       |             |
| `video_view`         | homepage launch video starts (autoplay when half on screen, or a click), once per page | `trigger`: autoplay \| click; `cut`: landscape \| square                 |             |
| `video_unmute`       | visitor turns the video's sound on, once per page                                      | `cut`; `at_seconds`                                                      |             |

`checkout_completed` is the client-side echo; the authoritative purchase
record is the order's `payment_status`, set by the Stripe webhook. The
summary uses orders for revenue and events for the funnel.

## Funnel definition

Unique `visitor_id` per step, per experiment:

```
page_view → cta_click → booking_opened → booking_submitted → checkout_started → checkout_completed
```

`GET /api/admin/summary` returns, per experiment:

- `funnel` (unique visitors per step),
- `orders_created`, `orders_paid`, `revenue_cents`, `average_order_cents`,
  `average_knives`, `visitor_to_paid_rate`,
- `waitlist_signups`,
- `repeat_customers`, `repeat_purchases`, `repeat_intent` counts,
- `average_time_to_fulfill_hours`,
- `by_channel` (views, paid, revenue per acquisition channel).

`?since=2026-10-01T00:00:00Z` limits the window.

## GA4 mapping

`initAnalytics` configures GA4 with `send_page_view: false` and user-scoped
properties `experiment_id`, `offer_version`, `price_version`,
`acquisition_source`, `acquisition_channel`. Every `track` call is forwarded
as a GA4 event with the same name and props. Mark `checkout_completed` as a
conversion in GA4 if you want its reporting; nothing in the repo depends on
it.

## Adding an event

1. Add the name to `EVENTS` in `packages/shared/src/analytics.ts` (and to
   `FUNNEL_STEPS` if it is a funnel step).
2. Call `track(EVENTS.name, props)` in the web app.
3. Document it in the table above. Props are limited to strings, numbers and
   booleans, 50 keys, 200 characters per string.
