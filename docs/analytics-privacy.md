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

**Linked to bookings.** The random browser id is pseudonymous, not anonymous. When someone
books or joins the waitlist, the same id is stored with that request (next to the name,
contact details and address the customer entered), so the owner can tell which page or
flyer led to a booking, and `/api/admin/insights` joins paid orders to their first visit.
For customers, analytics events are therefore linkable to a person and should be treated
as personal data (for example under CCPA/CPRA). The privacy panel says so. Reports output
only aggregates; the raw admin export (`/api/admin/events`) does contain browser ids.

The rate limiter stores a salted SHA-256 of the connecting IP per bucket (`migrations/0002_rate_limits.sql`):
per-minute buckets for about two minutes, and the daily page-view budget for about two
days. It never stores the IP itself.

## Retention and deletion

| data                     | where                    | kept                                                 | deleted by                                                                |
| ------------------------ | ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Analytics events         | D1 `analytics_events`    | 90 days (`expires_at`)                               | Daily cleanup Worker; hidden from reads once expired; visitor self-delete |
| Deletion tombstones      | D1 `analytics_deletions` | 90 days after a self-delete                          | Daily cleanup Worker (only the browser id and key hash, no events)        |
| Rate-limit buckets       | D1 `api_rate_limits`     | about 2 minutes; daily page-view budget about 2 days | Daily cleanup Worker                                                      |
| Privacy choices          | Browser `wkc.privacy`    | until the visitor clears it                          | The visitor                                                               |
| Browser id, attribution  | Browser localStorage     | until cleared or self-delete                         | "Delete my analytics data", or clearing site data                         |
| Deletion key             | Browser localStorage     | until cleared or self-delete                         | "Delete my analytics data"; events store only its SHA-256 (`owner`)       |
| Orders, waitlist entries | D1 `orders`, `waitlist`  | owner policy (not automated)                         | Owner, on request to the support address                                  |
| Payments                 | Stripe                   | Stripe's policy                                      | Stripe dashboard                                                          |
| GA4 (if enabled)         | Google                   | set in the GA4 property                              | GA4 data-retention setting (choose 2 months) and its user-deletion tool   |

- **Self-delete, with proof of possession.**
  - Each browser creates a random 256-bit deletion key on first use (`wkc.analytics_key`).
    Events never carry the key, only its SHA-256 as `owner`.
  - "Delete my analytics data" sends `POST /api/events/forget` with the browser id and
    the key. The API hashes the key and deletes only events with that id **and** that
    `owner`.
  - Knowing a visitor id (for example from an order export or a shared device) is not
    enough: without the key the request is rejected, and a wrong key deletes nothing.
  - Events someone planted under another browser's id carry the planter's own hash, so
    they cannot be used to delete the real visitor's events either.
  - The response is the same whether or not anything matched, so the endpoint cannot be
    used to probe for visitor ids.
  - The endpoint accepts nothing but the id and key, and is limited to 5 calls per minute
    per IP.
  - Counting is disabled **before** deletion starts. On failure the browser retains its
    id and deletion key for a real retry; missing keys are never reported as success.
    A successful response rotates the in-memory/session identity and owner before counting
    can resume, while preserving the price arm. Other tabs refresh their identity on re-enable.
  - Migration 0005 adds a proof-specific tombstone in the same D1 transaction as deletion.
    Late keepalive requests with that visitor/owner cannot recreate records. Tombstones
    expire after 90 days and are physically removed by the cleanup Worker.
  - Limits: events recorded before this release or through the legacy v1 protocol
    have no `owner` and can't be self-deleted. They expire within 90 days, or the owner
    deletes them on request. The API stops accepting v1 bodies at
    `LEGACY_V1_ACCEPTED_UNTIL` (set it about two weeks after the production deploy). Clearing site data loses the key, and with it self-service
    deletion of earlier events. New v2 events require an owner hash; browsers without
    Web Crypto do not send new analytics events. The panel distinguishes owned records
    from legacy/Google records it cannot erase.
- **Retention change.** v1 wrote a 180-day expiry. Code from this release writes 90 days.
  Existing rows are brought down to 90 days by `migrations/0003_analytics_retention.sql`,
  which the owner applies (staging first). See `docs/d1-retention-cleanup.md`.
- **Cleanup.** D1 has no TTL. `workers/cleanup` deletes expired rows daily, each table on
  its own (a failure on one is reported and does not skip the others). It is configured
  for staging only today. **Production needs the same Worker bound to the production
  database before launch**; until it runs there, expired rows are hidden from reports but
  still stored, and the panel's "deleted after 90 days" is not true in production.

## Consent and browser signals

Owner decisions (2026-10-11, issue #29):

- **First-party counts: on by default, with an opt-out.** They are not sold, not shared and
  not used for advertising. The footer's "Privacy & analytics" panel explains them and turns
  them off. Off means nothing is sent, including anything already queued.
- **Google Analytics: opt-in only.** It loads only when a reviewed manual-only property is configured (`VITE_GA4_MANUAL_EVENTS_ONLY=true`), the site has a measurement id, the
  visitor switches it on, there is no GPC or DNT signal, the page is not the thank-you page,
  and no dialog is open.
  - Consent Mode is set to deny `ad_storage`, `ad_user_data` and `ad_personalization`.
    Google signals and ad personalisation are off.
  - It receives only catalog events marked GA4, with sanitised `page_location` (route plus
    registered campaign ids) and `page_referrer` (known provider origin only).
  - It never receives our visitor id, view or event ids, order ids or anything from `/thanks`.
  - Withdrawing consent denies `analytics_storage` and removes `_ga` cookies.
- **GPC and Do Not Track block third parties only.** They always keep GA4, and any future
  third-party tool, off. First-party counts continue, because they are not a sale, a share
  or targeted advertising, and the visitor can still opt out.
- **No banner.** The launch freeze favours no visible change to the booking flow. The only
  visible change is a footer link, identical in both arms.

### Compliance caveats (engineering notes, not legal advice; confirm with counsel)

The defaults above are the owner's product decisions for a one-town US pilot. They are
**not** assumed to be legally sufficient everywhere.

- **New Jersey Data Privacy Act** (in force since 15 January 2025): applies to controllers
  of personal data of 100,000+ NJ consumers a year, or 25,000+ if they derive revenue from
  selling personal data.
  - A one-town pilot is very likely below both thresholds, so its duty to honour universal
    opt-outs (GPC) would likely not bind.
  - The design honours GPC for third parties anyway. Recheck if traffic grows or data is
    ever sold or shared.
- **Other US state laws** (California CCPA/CPRA; Colorado, Connecticut, Texas, Oregon and
  others) have their own thresholds, and some require honouring GPC as an opt-out of sale
  or sharing. Out-of-state visitors are possible. If the business crosses a threshold, review:
  - whether first-party counts on by default are acceptable
  - the notice-at-collection wording
  - the response deadlines for access and deletion requests
- **EU/UK visitors (GDPR, ePrivacy/PECR):** storing a browser id in localStorage for
  analytics generally needs **prior consent** there; an opt-out is not enough. If those
  visitors are ever targeted, counts must become opt-in for them, and GA4 opt-in alone
  would not be sufficient.
- **Google Analytics terms** require a privacy notice that discloses GA's use and cookies
  before enabling it. The footer panel is a notice about measurement, **not** a full privacy
  policy. Publish one (covering orders, payments, contact data and retention) before
  enabling GA4, or sooner.
- **Do Not Track** has no legal force in most places. Honouring it for third parties is a
  courtesy.
- **Orders and waitlist data** (names, addresses, phones) are outside this analytics scope.
  Their retention and deletion still need an owner policy.
- No data is sold and there is no targeted advertising. If that ever changes, every item
  above needs revisiting.

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
  `form_error` at 20. D1 also enforces 80 events per view atomically (legacy v1: per
  visitor scope), and binds its visitor, owner, experiment, source, channel and route.
  Batches cannot mix identities or views. The Pages API permits 120 requests **and**
  1,200 event units per minute per IP. Independent customers on a shared IP have independent
  view budgets; the IP ceiling is a shared abuse limit, not a person count.
- The API never logs event bodies. Validation failures return a fixed error without echoing
  input.
- Reporting endpoints (`/api/admin/summary`, `/api/admin/insights`, `/api/admin/events`)
  sit behind the existing `x-admin-key` check and rate limit. The insights output contains
  aggregates only.
- **Preference changes take effect immediately:**
  - every event is re-checked against the current choice when queued, again when flushed,
    and again just before the request is made
  - turning counts off drops queued events and stops everything after it
  - withdrawing Google consent sets Consent Mode `analytics_storage` to denied and Google's
    `ga-disable-<id>` switch, then removes `_ga` cookies
  - a choice made in another tab applies through the `storage` event
  - only a request already in flight cannot be recalled

## Reporting at scale

- Reports never load raw events into the Worker. `/admin/summary` and `/admin/insights`
  call `repo.analyticsReport`, which on D1 runs seven `GROUP BY` queries over the window
  (the seventh counts new landing visitors per UTC hour for the data-quality check; at
  most arms × hours in the window rows).
  Window filters apply before aggregation; window functions choose coherent first page-view dimensions.
- The Worker receives only aggregate rows. Their number is bounded by arms × device ×
  viewport × channel × source and by the allowlisted enums, not by traffic. The 200,000-event
  test checks bounded results, including historical hostile source/experiment cardinality.
  SQL canonicalizes source, experiment, names and property dimensions **before** grouping.
- Orders and waitlist totals use `commerceReport` SQL aggregates with the requested window
  applied before counting; there is no 5,000-record list cap. No raw customer JSON reaches
  these report services. Paid device/viewport uses one first retained page view in the same
  arm/window, no later than order creation, through the 0004 visitor index. Deletion uses
  the same index. No match is reported as unknown.
- The SQL is checked against a reference implementation (`reportFromEvents`) by a contract
  test, so the D1 and in-memory numbers agree.
- **Measured locally:** 200,000 events aggregate in about 7.5 s on Node's SQLite. Real D1
  performance differs and has not been measured; the staging steps include a check.

Remaining limits:

1. **D1 rows read.** Each report reads about 6 rows per event in the window. The full
   90-day window at 200k events is about 1.2M rows read per report; the Workers Free plan
   allows 5M a day at the time of writing. Use `since`/`until` (for example weekly), or the
   Paid plan.
2. **D1 query time.** D1 limits query duration (about 30 s at the time of writing). The scans
   grow linearly. Beyond roughly 1–2 million events in one window, narrow the window or add
   a nightly rollup table. A rollup is not built here.
3. **No cache.** Every call recomputes. Admin traffic is rate-limited to 30 requests a
   minute.
4. **Raw export.** `/admin/events` is capped at 5,000 rows per call, newest first. It is for
   spot checks; use the report for analysis.
5. **Legacy AWS build.** The DynamoDB repository still aggregates in the Lambda from a full
   listing. It is not used on Cloudflare.
6. **Distinct visitors per segment.** All dimensions come from one earliest page view in
   the report window and arm (first event fallback), with timestamp/id ties resolved together.
7. **Untrusted telemetry.** Public requests can still fabricate random ids and UX actions.
   Server budgets (120 requests and 1,200 events a minute, and 200 page views a day, per
   IP) and fixed registries bound amplification and result cardinality; they do not prove
   human identity, and many addresses together can still add visitors. Therefore:
   - experiment decisions use paid orders and net revenue (Stripe-confirmed, fully
     refunded orders excluded), which cannot be faked without paying;
   - per-visitor rates use only paid orders with a counted visit, so both sides come from
     the same measured population, and visitors exclude `/thanks`-only browsers;
   - each arm carries `data_quality` (page-view-only share, hourly spikes) with warnings
     that tell the reader to ignore visitor rates for that arm.

## Costs

First-party analytics uses the existing Pages Functions and D1. The created, expiry,
visitor and view indexes increase write accounting; the abuse guards and report queries
also consume reads. Do not infer a daily visit allowance from the old two-index estimate.
Check actual D1 accounting and current quotas before scaling. Result cardinality is bounded,
but SQL scan cost and duration still grow with the report window. No paid provider is added.
GA4 standard is optional and has its own quotas; nothing enables it automatically.

## Registered context and Google rollout

Analytics sources must appear in `ANALYTICS_SOURCES` in `packages/shared/src/analytics.ts`.
Unknown tags (including names, streets and ZIPs) collapse to `other` in every analytics
event and report, including historical rows and paid-order source splits. Register reviewed
non-personal campaign ids before use. Orders and waitlist entries keep the tag as sent,
under the existing format validation (`sourceSchema`), so an unregistered campaign is not
lost from the business record; analytics never exports an arbitrary tag. Visitor ids must
match the random UUID / fallback browser-id formats.
Google URL parameters are limited to registered sources, experiment ids and channel enums;
referrers are limited to known provider origins. No visitor id or ownership proof is sent.

Setting a measurement id is insufficient: `VITE_GA4_MANUAL_EVENTS_ONLY=true` is required.
The owner must first disable **all Enhanced Measurement** in the GA4 property, including
form interactions, outbound clicks and history-based page views, review a synthetic browser
network trace, and set the property retention to two months. This configuration was not
changed or verified here. Until confirmed, the tag remains disabled. Manual forwarding
also stops on `/thanks` and inside open dialogs; automatic provider behavior is not proven
by mocked tests. Google records require Google's separate deletion tool.

Legacy AWS: transaction-based event guards require the declared DeleteItem and
ConditionCheckItem permissions if that adapter is ever used. Nothing applies those IAM
changes here. Its reports still aggregate full paginated listings in Lambda, and self-delete
uses an eventually consistent visitor GSI; newly indexed rows may require a later retry or
TTL cleanup. Cloudflare/D1 is the reviewed deployment target; do not treat this as AWS
privacy acceptance or deploy it without separate integration verification.
