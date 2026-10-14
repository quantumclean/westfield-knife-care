# Checkout idempotency review

Status: implemented and locally validated on `fix/checkout-idempotency`; not deployed and
no persistent database migration has been applied.

## Resolved review findings

- Stripe expiry and retry consistency: the 60-minute expiry is computed once, persisted,
  and reused with identical Stripe parameters and the same order-based idempotency key.
- Sensitive persistence: migration 0006 uses structured minimal columns. It stores no
  customer contact/address data, notes, feedback token, redirect URL, or Checkout URL.
- Replay privacy: only a Session ID is stored. Stripe is queried on retry and a bearer URL
  is returned only while the Session is open.
- Retention: the minimal binding remains with its order and must be deleted with that order,
  never by analytics TTL cleanup. An owner-approved order deletion policy is still needed.
- Atomicity: D1 batch and Dynamo transactional writes claim the key and create the order
  together. The order remains the sole source of customer and price data.
- Payload comparison: the stored fingerprint is an HMAC keyed by the raw random request
  key, reducing offline guessing risk from a database disclosure.
- Browser retries: local storage shares a booking key across reloads and same-origin tabs;
  a normalized change rotates it, and confirmed completion clears it.
- Flyer pricing: the server continues to resolve the experiment and quote; client pricing
  fields are ignored.

## Deployment prerequisite

Migration 0006 must be applied and verified before the API is deployed. Missing checkout
storage fails order creation closed. No remote migration, deployment, or live Stripe call
was performed by this work. See `docs/checkout-idempotency.md` for the exact rollout order.

## Remaining security and operational risk

- Distinct keys on different devices can create distinct orders.
- Clearing local storage loses recovery state.
- Possession of the raw key plus exact payload permits recovery of an open Session URL.
- Provider ambiguity after expiry requires manual Stripe/test-mode reconciliation; the
  service does not create a replacement Session automatically.
- The checkout binding cannot be deleted independently without reopening duplicate risk.
- The legacy Dynamo path is covered with mocked SDK transactions, not a live AWS table.

Logs, traces, and artifacts must continue to redact idempotency headers, booking bodies,
feedback tokens, and Checkout URLs.
