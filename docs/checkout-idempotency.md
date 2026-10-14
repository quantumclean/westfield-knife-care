# Checkout request recovery

`POST /api/orders` accepts an `Idempotency-Key` containing 16–128 letters, numbers,
hyphens, or underscores. The web client generates a UUID and shares it through
same-origin local storage, so retries, reloads, cancelled returns, and another browser tab
reuse the key for the same normalized booking. Changed booking details get a new key.
Clients without the header remain compatible but do not receive durable deduplication.

The API validates and normalizes the booking, hashes the request key, and creates an HMAC
of the normalized payload using the raw high-entropy request key. It atomically inserts the
minimal checkout binding and the authoritative order. Concurrent callers either own that
one order or read the winner; reuse with different details returns `409
idempotency_conflict`. Server-side flyer resolution and pricing remain authoritative.

The checkout table stores only the key digest, payload HMAC, order ID, timestamps, fixed
Stripe expiry, site origin, non-PII display description, and optional Stripe Session ID.
Customer details, notes, feedback tokens, success/cancel URLs, and hosted Checkout URLs are
not duplicated there. They remain in the order or Stripe as appropriate.

Stripe Session creation uses `checkout-<order id>`, one fixed expiration exactly 60 minutes
after the intent was created, and identical parameters on every retry. Once a Session ID is
saved, retries retrieve it from Stripe. Only an `open` Session's current URL is returned;
`complete` and `expired` Sessions return terminal 409 responses without a bearer URL. An
unknown creation outcome is retried only before the fixed expiry, after which it returns
`checkout_recovery_required` for manual reconciliation.

## Retention and deletion

Checkout bindings are minimal integrity records, not analytics. Keep each binding as long
as its order exists so a forgotten key cannot create a duplicate later. Delete it only in
the same owner-approved workflow that deletes the linked order. Do not add this table to
the analytics cleanup Worker's generic expiry deletion: doing so would weaken duplicate
prevention. The existing analytics 90-day retention policy does not apply to orders or
checkout bindings.

No automatic order deletion policy exists yet. Until the owner approves one, the minimal
binding remains with the order. Future deletion must remove the checkout binding and order
together and account for payment/accounting retention requirements.

## Migration-first rollout

`migrations/0006_checkout_requests.sql` is additive and repeatable and does not alter or
backfill existing orders. It must be applied to each target D1 database **before** this API
version is deployed. The Pages adapter returns 503 for order creation when the table is
missing, and the service cannot safely fall back to non-idempotent creation.

Required order for a later authorized rollout:

1. Back up and identify the exact target D1 database.
2. Apply migration 0006 and verify its columns and index.
3. Deploy the API code.
4. Run synthetic test-mode Stripe checkout and retry checks.
5. Monitor 409/5xx results without logging request keys, bodies, feedback tokens, or URLs.

This branch does not apply remote migrations or deploy anything. The legacy Dynamo adapter
uses an atomic transactional write in the existing table and needs no schema migration.

## Remaining limits

- Different devices or clients that generate different keys can still create separate
  orders; idempotency cannot infer customer intent.
- Clearing local storage before a response is recovered loses the browser's key.
- A caller holding both the key and exact booking payload can recover an open Checkout URL;
  the key is therefore sensitive even though it is sent in a header and stored hashed.
- Stripe transport failures and cached provider errors can still require manual
  reconciliation after the fixed expiry.
- CORS limits browser origins but is not direct-client authentication. Existing rate limits,
  `Cache-Control: no-store`, signed webhook verification, amount/currency checks, and
  Session-ID matching remain required.
