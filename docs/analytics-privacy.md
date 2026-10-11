# Analytics privacy, consent and retention

What the site measures, what it never measures, where data goes, how long it stays and who
decides. Event details are in `docs/analytics-events.md`; reading the report is in
`docs/analytics-insights.md`. This is an engineering summary, not legal advice.

## Principles

1. **Measure steps, not people.** Events say which step, section, field id or error kind,
   never what was typed. Every property is an allowlisted enum, bounded number or id list
   (`CATALOG` in `packages/shared/src/analytics.ts`), checked in the browser and again,
   strictly, by the API.
2. **Money comes from orders.** Paid orders and revenue are read from order records whose
   payment status is set by Stripe's signed webhook, never from browser events.
3. **First-party by default, third parties by choice.** Our own counts are on unless the
   visitor turns them off. Google Analytics is off unless the visitor turns it on. Session
   replay and heatmap tools are not installed.
4. **Short retention, easy deletion.** Raw events are deleted after 90 days. A visitor can
   delete their own events from the footer panel.

## Data flow

```
Browser ──(batched, allowlisted events)──▶ POST /api/events ──▶ D1 analytics_events (90 days)
   │                                         (strict catalog,          │
   │                                          no logging,              ▼
   │                                          rate-limited)   GET /api/admin/insights
   │                                                          (admin key; aggregates only,
   │                                                           small cells suppressed)
   │
   ├──(only after opt-in, no GPC/DNT, not on /thanks)──▶ Google Analytics 4 (if configured)
   │
   └── orders / waitlist ──▶ POST /api/orders, /api/waitlist ──▶ D1 orders, waitlist ──▶ Stripe
```

## What is collected, and what never is

| Collected (first-party)                                       | Never collected                                   |
| ------------------------------------------------------------- | ------------------------------------------------- |
| Random browser id (`wkc.visitor_id`) and a per-page-load id   | Anything typed into a form, raw form content      |
| Assigned experiment arm, first-touch source tag and channel   | Name, email, phone, street, ZIP, notes            |
| Route id (`/`, `/a`, `/b`, `/thanks`, `other`)                | Full URLs or query strings, referrer paths        |
| Device class and viewport band                                | IP addresses, fingerprints, precise location      |
| Which section, scroll milestone, booking step, FAQ id         | Order ids, Stripe session ids, payment fields     |
| Field ids that failed validation, and how (missing or format) | Feedback tokens or any other secret               |
| Error kind and area, web-vital ratings                        | Error messages or stack traces                    |
| Address-suggestion outcome (shown, chosen, fallback)          | Apple Maps queries, results or selected addresses |

The rate limiter stores a salted SHA-256 of the connecting IP per minute bucket for about
two minutes (`migrations/0002_rate_limits.sql`); it never stores the IP itself.

## Retention and deletion

| data                     | where                   | kept                         | deleted by                                                                |
| ------------------------ | ----------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Analytics events         | D1 `analytics_events`   | 90 days (`expires_at`)       | Daily cleanup Worker; hidden from reads once expired; visitor self-delete |
| Rate-limit buckets       | D1 `api_rate_limits`    | about 2 minutes              | Daily cleanup Worker                                                      |
| Privacy choices          | Browser `wkc.privacy`   | until the visitor clears it  | The visitor                                                               |
| Browser id, attribution  | Browser localStorage    | until cleared or self-delete | "Delete my analytics data", or clearing site data                         |
| Orders, waitlist entries | D1 `orders`, `waitlist` | owner policy (not automated) | Owner, on request to the support address                                  |
| Payments                 | Stripe                  | Stripe's policy              | Stripe dashboard                                                          |
| GA4 (if enabled)         | Google                  | set in the GA4 property      | GA4 data-retention setting (choose 2 months) and its user-deletion tool   |

- **Self-delete.** "Delete my analytics data" calls `POST /api/events/forget` with the
  browser's random id. That id is known only to that browser. The API deletes every event
  with that id. The browser then forgets its id and attribution and turns counting off;
  it keeps its assigned price arm, so the price shown does not change. The endpoint
  accepts nothing but the id and is limited to 5 calls per minute per IP.
- **Retention change.** v1 wrote a 180-day expiry. Code from this release writes 90 days.
  Existing rows are brought down to 90 days by `migrations/0003_analytics_retention.sql`,
  which the owner applies (staging first). See `docs/d1-retention-cleanup.md`.
- **Cleanup.** D1 has no TTL. `workers/cleanup` deletes expired rows daily. It is
  configured for staging only today; production needs the same Worker bound to the
  production database before launch.

## Consent and browser signals

Owner decisions (2026-10-11, issue #29):

- **First-party counts: on by default, with an opt-out.** They are not sold, not shared and
  not used for advertising. The footer's "Privacy & analytics" panel explains them and turns
  them off. Off means nothing is sent, including anything already queued.
- **Google Analytics: opt-in only.** It loads only when the site has a measurement id, the
  visitor switches it on, there is no GPC or DNT signal, the page is not the thank-you page,
  and no dialog is open.
  - Consent Mode is set to deny `ad_storage`, `ad_user_data` and `ad_personalization`.
    Google signals and ad personalisation are off.
  - It receives only catalog events marked GA4, with sanitised `page_location` (route plus
    campaign tags) and `page_referrer` (origin only).
  - It never receives our visitor id, view or event ids, order ids or anything from `/thanks`.
  - Withdrawing consent denies `analytics_storage` and removes `_ga` cookies.
- **GPC and Do Not Track block third parties only.** They always keep GA4, and any future
  third-party tool, off. First-party counts continue, because they are not a sale, a share
  or targeted advertising, and the visitor can still opt out.
- **No banner.** The launch freeze favours no visible change to the booking flow. The only
  visible change is a footer link, identical in both arms.

### Legal context, to confirm with counsel

- The **New Jersey Data Privacy Act** (in force since 15 January 2025) applies to controllers
  of personal data of 100,000+ NJ consumers a year, or 25,000+ if they derive revenue from
  selling personal data. A one-town pilot is very likely below both thresholds, so its
  universal opt-out (GPC) duty would not bind. The design honours GPC for third parties
  anyway.
- No data is sold and there is no targeted advertising.
- EU/UK visitors are not targeted. If that changes, GA4 opt-in already matches the
  consent-first model those rules expect.

## Sensitive screens

The thank-you page (order status, first name, feedback) and any open dialog (booking and
waitlist forms, this panel) are sensitive:

- nothing third-party loads there
- page-scroll measurement pauses
- the booking observer reads field `name` attributes, never `value`s

`isSensitiveScreen()` in `apps/web/src/lib/analytics.ts` is the hook any future tool must
check.

## Third-party tools: status and gates

| tool                     | status                                      | cost             | before enabling                                                                                   |
| ------------------------ | ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Google Analytics 4       | Code ready, opt-in; no production id is set | Free (standard)  | Owner creates a property, sets data retention to 2 months, disables Google signals, adds the id   |
| Microsoft Clarity        | **Not installed.** Off by default.          | Free             | Separate written owner approval, plus the masking checklist below verified independently          |
| Cloudflare Web Analytics | **Not installed.**                          | Free, cookieless | Owner decides; if enabled, use the Pages project toggle, not a script tag, and add it to this doc |

**Clarity masking checklist** (all must be verified on staging with recordings reviewed
before any production use):

1. Strict masking mode on in the Clarity project.
2. `data-clarity-mask="true"` on every dialog and on `/thanks`.
3. Recordings of a full booking (with address suggestions), the waitlist, the thank-you page
   and feedback show no names, emails, phones, addresses, ZIPs, notes or order details.
4. It loads only through the same consent and `isSensitiveScreen()` gates as GA4.
5. Prefer heatmaps over recordings.

## Operations

- Every analytics write is asynchronous and batched. Failures are swallowed, and a 429 or 503
  pauses sending for the rest of the page load, so there is no retry storm. Offline events
  are held in memory (at most 40) until the browser is back online.
- Per page load the browser sends at most 80 events, with `client_error` capped at 3 and
  `form_error` at 20. The API limits `/api/events` to 120 requests per minute per IP.
- The API never logs event bodies. Validation failures return a fixed error without echoing
  input.
- Reporting endpoints (`/api/admin/summary`, `/api/admin/insights`, `/api/admin/events`)
  sit behind the existing `x-admin-key` check and rate limit. The insights output contains
  aggregates only.

## Costs

First-party analytics runs on the existing Cloudflare Pages Functions and D1. Each event
insert is about 3 D1 "rows written": the row plus two indexes. On the Workers Free plan
(100,000 rows written and 5 million read per day, at the time of writing), that is roughly
3,000 ten-event visits a day before limits matter. One insights report reads each retained
event once. Check Cloudflare's current D1 pricing before scaling. GA4 standard and Clarity
are free. Nothing in this change adds a paid service.
