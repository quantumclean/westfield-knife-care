# API risk review (read-only)

Review of the Cloudflare API path for production readiness: the Pages Function
adapter (`apps/api/src/cloudflare.ts`), the D1 repository
(`apps/api/src/repo/d1.ts`), the Stripe adapter (`apps/api/src/payments/stripe.ts`),
the order service (`apps/api/src/services/orders.ts`), the webhook route and the
admin route.

**Nothing in `apps/api` was changed.** Every finding below was reproduced against
the real service code with the in-memory repository and the fake gateway (no
network, no Stripe, no D1), or observed on the live staging preview. Fixes are
for the backend owner to make, with approval, because they touch payments and
customer data.

The backend author already lists several of these in `docs/cloudflare-api.md`
("Launch blockers"): last-write-wins order writes, webhook deduplication and
reconciliation, rate limiting, and scheduled analytics cleanup. This review
confirms those with concrete reproductions and adds payment-state findings that
are not yet listed.

## P0 — fix before real payments

### A1. A replayed `checkout.session.completed` flips a refunded order back to paid

`applyPaymentEvent` (`orders.ts:122`) only short-circuits the completed branch
when the order is already `paid`. Stripe retries webhooks for up to ~3 days and
can deliver them out of order, so a refunded order that later receives a
retried or delayed completed event is set back to `paid`.

Reproduced: paid → refunded → replay completed ⇒ **paid** (expected refunded).

Fix direction: treat `paid`, `refunded`, `expired` and `failed` as terminal for
a replayed completed event, and/or dedupe on the Stripe event id.

### A2. Concurrent writers overwrite each other (last write wins)

Every write is a read-modify-write of the whole order JSON blob
(`putOrder`, `d1.ts:30`) with no row version or conditional update. A webhook
and an admin `PATCH` (or the customer feedback POST) that overlap lose one
side's change.

Reproduced: an admin `PATCH {pickup_status}` racing the paid webhook ends with
`payment_status: pending` — the webhook's write was discarded. The reverse race
reverts a refunded order to paid.

Fix direction: optimistic concurrency (a `version`/`updated_at` guard in the
`UPDATE … WHERE`), narrow column updates instead of a whole-blob rewrite, or
D1 batch/transaction. Already flagged in `docs/cloudflare-api.md`.

## P1 — fix before or shortly after launch

### A3. Completed event is not matched to the order's checkout session

The completed branch marks the order paid from `metadata.order_id` /
`client_reference_id` and then overwrites `stripe_checkout_session_id` with
whatever session the event carried (`orders.ts:138`), without checking it
matches the session created for that order. The amount check is the only guard.

Reproduced: a completed event with `cs_some_other_session` marks the order paid
and replaces the stored session id. Recommend verifying the session id (or
payment-intent) belongs to the order before confirming.

### A4. A partial refund is recorded as a full refund

`normaliseStripeEvent` for `charge.refunded` (`stripe.ts`) ignores
`amount_refunded` vs `amount`, so a partial refund sets `payment_status:
refunded` for the whole order. This misstates revenue in the admin summary.

### A5. A refund for a never-paid order is accepted

The `refunded` branch (`orders.ts:151`) has no state guard and will move a
`pending`/`failed`/`expired` order to `refunded`. Low likelihood, but the state
machine should only allow `paid → refunded`.

### A6. No rate limiting or abuse control on public writes

`POST /api/orders`, `/api/waitlist` and `/api/events` have no per-visitor,
per-IP or per-email limit. Reproduced: 50 order requests create 50 pending
orders — in production each also creates a Stripe Checkout session (cost,
quota, and a `findOrdersByEmail` scan per call). Recommend Cloudflare WAF rate
limiting on `/api/*` plus an application cap. Already flagged in
`docs/cloudflare-api.md`.

### A7. Analytics rows are never deleted

D1 has no TTL. `listEvents` filters on `expires_at` but nothing deletes expired
rows (`d1.ts:93`, migration comment at `0001_wkc_d1.sql:33`), so the table grows
without bound. Schedule the `DELETE` the migration documents (a Cron Trigger).
Already flagged in `docs/cloudflare-api.md`.

## P2 — lower risk, note for later

### A8. Currency is never compared

`PaymentEvent` has no currency field, so the amount check compares the integer
only (`orders.ts:128`). We create the session in our own currency so Stripe
echoes it, but a defence-in-depth currency check is cheap.

### A9. Public order view is an unauthenticated read keyed on the order id

`publicOrderView` (`orders.ts:221`) returns first name, knife count, care day,
totals and experiment/attribution to anyone holding the order id. No email or
address is exposed (good). Order ids are v4 UUIDs in the `success_url`, so
enumeration is impractical, but there is no rate limit on `GET /orders/:id`.
Acceptable as a receipt link; revisit if ids ever become guessable.

### A10. Admin access is a single shared static key

`adminRoutes` uses a timing-safe compare of one `x-admin-key`
(`admin.ts:60`) and returns `503 admin_disabled` when no key is set (a safe
default; confirmed on staging). There is no key rotation, per-operator
identity, audit log or IP allowlist, and the admin API shares the public
origin. Acceptable for a solo operator; tighten if more people get access.

## What is already correct

- `/api/*` responses send `Cache-Control: no-store` (`cloudflare.ts:110`).
- Payments stay disabled unless `SITE_URL` exactly equals the request origin and
  the Stripe key matches the stage's mode (`sk_test_` for staging, `sk_live_`
  for production) — confirmed on staging, where `payments_enabled:false` and
  `POST /api/orders` returns 503.
- An amount mismatch throws, returning a non-2xx so Stripe retries rather than
  silently confirming a wrong total (`orders.ts:128`; PR #5).
- Webhook signatures are verified with the WebCrypto provider in the Worker
  runtime (`stripe.ts`; PR #9).
- The admin key compare is length-checked and timing-safe.
- The frontend never receives a D1 binding; customer email and address are not
  in the public order view.
