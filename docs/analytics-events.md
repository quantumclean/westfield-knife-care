# Analytics events (schema v2)

The site counts visits in a privacy-conscious way to answer six questions: where visitors
came from, whether they engaged, where booking fails, whether address suggestions help,
whether mobile visitors struggle more, and which experiment produces more **confirmed paid**
orders. Privacy rules, retention and consent are in `docs/analytics-privacy.md`. How to read
the report is in `docs/analytics-insights.md`.

## Where events go

1. **First-party, always the source of truth.** `POST /api/events` stores events in the
   Cloudflare D1 table `analytics_events` (migration `0001`) for 90 days (`EVENT_RETENTION_DAYS`).
   The browser batches events (up to 20 per request) and sends funnel-critical ones at once.
2. **Google Analytics 4, optional and opt-in.** Only when `VITE_GA4_MEASUREMENT_ID` is set,
   the visitor turned it on in "Privacy & analytics", the browser sends no GPC/DNT signal,
   and the page is not the thank-you page. Only catalog events marked "GA4" below are
   forwarded. Nothing in this repo depends on GA4.

Payment and revenue always come from orders (Stripe webhook state), never from events.

## The catalog is the allowlist

`packages/shared/src/analytics.ts` (`CATALOG`) lists every event and every property it may
carry. Properties are enums, bounded integers or lists of known ids. **No event can carry
typed text, names, contact details, addresses, ZIP codes, order ids, payment fields, tokens
or URLs.**

- The browser runs `normalizeEvent` before sending. Unknown events are dropped; unknown
  properties and values that don't fit are dropped; an unknown `location` becomes `other`.
- The API runs the same catalog strictly (`parseEventPayload` and `validateEventProps`). Any
  unknown key or value rejects the whole batch with a bare `400 {"error":"invalid_event"}`
  that never repeats what was sent. Nothing about the request is logged.

## Context on every event

| field                 | value                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| `v`                   | `2`                                                                                   |
| `event_id`            | random per event; the stored id is `ev-<event_id>`, so a retried batch is stored once |
| `owner`               | SHA-256 of this browser's deletion key (proof of possession for self-deletion)        |
| `view_id`             | random per page load (bounces, once-per-view dedup); not stored in the browser        |
| `visitor_id`          | random id in localStorage (`wkc.visitor_id`); first-party only, never sent to GA4     |
| `experiment_id`       | assigned arm; offer and price versions are resolved by the API                        |
| `source`              | registered source id (`ANALYTICS_SOURCES`); all unregistered tags → `other`           |
| `acquisition_channel` | `print`, `social`, `referral`, `search`, `direct`, `partner`, `other`                 |
| `page`                | route id: `/`, `/a`, `/b`, `/thanks` or `other` (never a raw path or query)           |
| `device`              | `mobile` (< 640px), `tablet` (touch, < 1366px), `desktop`, `unknown` (pre-v2)         |
| `viewport`            | `xs` < 400 ≤ `sm` < 640 ≤ `md` < 1024 ≤ `lg`, `unknown` (pre-v2)                      |
| `created_at`          | server time                                                                           |

## Event dictionary

"Once" means repeats are dropped: per page load (view), or per opening of the booking sheet.

| event                | when                                                                                                               | props                                                                              | once                | GA4 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------- | --- |
| `page_view`          | page load of `/`, `/a`, `/b` or `/thanks`                                                                          |                                                                                    | view                | yes |
| `cta_click`          | any Sharpen or Pilot button                                                                                        | `cta`: sharpen, pilot; `location` (below)                                          |                     | yes |
| `booking_opened`     | booking sheet shown (step 1); also `checkout-cancelled` when Stripe's cancel link reopens it (no `cta_click` then) | `location`                                                                         |                     | yes |
| `booking_step`       | step 2 (your details) shown, sent by the booking sheet itself (never inferred)                                     | `step`: choose, details                                                            | booking, per step   | yes |
| `booking_closed`     | booking sheet closed before checkout started                                                                       | `step` reached when it closed                                                      | booking             | no  |
| `booking_submitted`  | booking passed client validation                                                                                   | `knives` 1–50, `total_cents`                                                       |                     | yes |
| `checkout_started`   | order created, redirecting to Stripe                                                                               | `total_cents`                                                                      |                     | yes |
| `checkout_returned`  | back from Stripe with `?cancelled=1`                                                                               | `outcome`: cancelled                                                               | view                | no  |
| `checkout_completed` | thank-you page shows the order paid (client echo only)                                                             | `total_cents`                                                                      | view                | no  |
| `pilot_opened`       | waitlist dialog shown (incl. switches from booking)                                                                | `location`                                                                         |                     | yes |
| `pilot_submitted`    | waitlist entry saved                                                                                               | `cadence`, `interest`                                                              |                     | yes |
| `faq_opened`         | an FAQ item expanded                                                                                               | `question`: FAQ id                                                                 | view, per question  | yes |
| `form_error`         | client validation failed                                                                                           | `form`: booking, pilot; `fields`: field ids; `kinds`; `count` 0–20                 | max 20 per view     | no  |
| `section_view`       | a landing section is substantially on screen                                                                       | `section`: hero, how_it_works, process_film, pricing, faq                          | view, per section   | yes |
| `scroll_depth`       | scroll milestone reached (not while a dialog is open)                                                              | `percent`: 25, 50, 75, 90                                                          | view, per milestone | yes |
| `page_engagement`    | first time the landing page is hidden or left                                                                      | `time`: <10s, 10-30s, 30-60s, 1-3m, 3m+; `max_scroll`                              | view                | no  |
| `video_view`         | the process film starts playing                                                                                    | `trigger`: autoplay, click, play; `format`: standard, landscape, square            | view                | yes |
| `video_progress`     | film milestone reached                                                                                             | `percent`: 25, 50, 75, 100                                                         | view, per milestone | yes |
| `video_unmute`       | sound turned on                                                                                                    | `format`, `at_seconds` 0–600                                                       | view                | no  |
| `address_suggest`    | Apple address suggestions (only when Maps is configured)                                                           | `action`: shown, chosen, fallback, unavailable, out_of_area; `results`: 0, 1-3, 4+ | booking, per action | no  |
| `client_error`       | uncaught error, rejected promise, failed API call                                                                  | `kind`: error, rejection, api, chunk; `area`; `status`: network, 4xx, 5xx          | max 3 per view      | no  |
| `web_vitals`         | first time the page is hidden                                                                                      | `lcp`, `inp`, `cls`, `ttfb`: good, needs_improvement, poor; `nav`                  | view                | no  |

- `location`: hero, nav, pricing, sticky, footer, deep-link, checkout-cancelled,
  out-of-area, booking-closed, thanks, other.
- Field ids (`fields`): name, email, phone, line1, line2, city, state, zip, notes, knives,
  care_day, service_interest, cadence, other. Validation paths such as
  `customer.address.zip` are mapped to these ids before sending.
- `kinds`: `missing` (left empty), `format`, `out_of_area`, `other`.
- `client_error.area`: page, booking, pilot, thanks, config, order_status, feedback, other.
  Error messages and stacks are never sent.
- A switch from booking to the waitlist is a `pilot_opened` with `location` `out-of-area`
  or `booking-closed`. There is no separate event.

`address_suggest` actions: `shown` (suggestions listed, with a count band), `chosen` (one was
picked), `out_of_area` (the picked address is outside the service area), `fallback` (the
visitor opened the search, then typed the address by hand), `unavailable` (Apple's SDK failed
to load). The search text, results and chosen address are never sent.

The landing-page observers (sections, scroll, time, film, booking sheet closed) live in
`apps/web/src/lib/engagement.ts`. They work from the DOM, so components need no tracking
code, and they never read form fields. Booking step progress is explicit: `BookingForm`
sends `booking_step` when it changes step. Field focus is not used, because autofill and
programmatic focus would make it unreliable.

## Funnels

The v1 experiment funnel is unchanged (`FUNNEL_STEPS`, used by `GET /api/admin/summary`):

```
page_view → cta_click → booking_opened → booking_submitted → checkout_started → checkout_completed
```

The insights report (`GET /api/admin/insights`) uses a finer funnel, counting unique visitors
per step. `paid` is taken from orders, not from `checkout_completed`:

```
visited → engaged → cta_click → booking_opened → booking_details → booking_submitted → checkout_started → paid
```

## Versioning and migration from v1

v2 keeps every v1 event name and the v1 funnel, so existing summaries stay comparable. The
differences, deployed to both arms at once (see `docs/launch-freeze.md`):

| change                                                      | analysis impact                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `checkout_started` / `checkout_completed` lose `order_id`   | Join events to orders via `visitor_id` only (admin side)                |
| `booking_submitted` loses `care_day`                        | Pickup day demand comes from orders                                     |
| `form_error.fields` are field ids, plus `kinds` and `count` | Compare v1 and v2 field counts after mapping paths to ids               |
| `page` is a route id instead of a raw pathname              | `/thanks?...` and unknown paths now read `/thanks` and `other`          |
| unknown event names and props are rejected                  | Nothing that v1 code sent is lost except dropped props                  |
| new context: `view_id`, `device`, `viewport`, `v`           | Pre-v2 rows have none; reports show them as `unknown`                   |
| events kept 90 days (was 180)                               | Apply `migrations/0003_analytics_retention.sql`; export older summaries |
| GA4 only after opt-in, never on `/thanks`, no visitor id    | GA4 numbers will be far lower than first-party ones; don't compare them |

A browser tab opened before the deploy still sends v1 bodies. The API normalises them into
v2 (dropping `order_id` and other unlisted props) and validates them strictly. Those rows have
`device: "unknown"` and `view_id: "legacy-v1"`.

## Adding an event

1. Add it to `EVENTS` and `CATALOG` in `packages/shared/src/analytics.ts` with enum or
   integer props only. Decide `once`, `cap` and `thirdParty` deliberately.
2. Call `track(EVENTS.name, props)`, or observe it in `engagement.ts`.
3. Add it to the dictionary above and, if it is a step, to `services/insights.ts`.
4. The shared catalog tests reject free-text props and identifier-like prop names.

## Independent review hardening

V2 ingestion requires an owner hash, a random-format visitor id, registered experiment and
consistent visitor/view/context within a batch. Unknown sources map to `other`. Event ids
are random UUIDs (or the browser timestamp/random fallback), not arbitrary text. The API
adds request/unit limits and atomic per-view budgets. These protect capacity, not human
identity: public UX metrics remain untrusted estimates. Deletion proof does not authenticate
ingestion. Financial outcomes use complete windowed SQL aggregates, never client completions.
Apply migrations 0003, 0004 and 0005 before enabling the revised analytics API, and run
the revised scheduled cleanup for both expired events and deletion tombstones.
