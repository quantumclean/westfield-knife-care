# Cloudflare staging backend hardening rollout

**Staging only. No live Stripe keys or customer data until end-to-end testing.**

## 1. D1 migration (required before merging/deploying this code)

From the repository root on the approved backend branch:

```powershell
npx --yes wrangler@latest d1 execute westfield-knife-care-staging --remote --file migrations/0002_rate_limits.sql
```

Verify migration:

```powershell
npx --yes wrangler@latest d1 execute westfield-knife-care-staging --remote --command "SELECT name FROM sqlite_master WHERE name = 'api_rate_limits';"
```

Existing orders remain in D1; the new optimistic-locking revision is tracked
inside the order JSON. Existing orders without the field are treated as revision 0.

## 2. Request protection

Add a **Preview environment secret** named `RATE_LIMIT_SALT` to the Pages
project (32+ random bytes represented as a hex string; do not commit it).
Generate a new value locally, for example with PowerShell:

```powershell
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Never paste the resulting secret into a chat or PR. Pages API write endpoints
fail closed without the salt or Cloudflare's connecting-IP header. Re-deploy
Preview after binding the secret.

Staging rate limits per salted IP hash, in a UTC-minute bucket:
- POST /api/orders: 5 requests/minute
- POST /api/waitlist: 5 requests/minute
- POST /api/events: 120 requests/minute
- /api/admin/*: 30 requests/minute
- /api/webhooks/stripe: no IP throttle (signed Stripe retries must work)

A legitimate customer may hit a 429 behind a shared public IP; confirm the
limits with real staging traffic. Add Cloudflare WAF rules and admin Cloudflare
Access policies before production (dashboard-managed; not set by this PR).
The salt is used in the hash input; only hash values are stored.

## 3. Daily retention cleanup

Deploy the **separate** staging Cron Worker only after reviewing the included
config: `workers/cleanup/wrangler.jsonc` includes the staging database id.

```powershell
npx --yes wrangler@latest deploy --config workers/cleanup/wrangler.jsonc
```

It removes expired analytics (>180 days) and short-lived rate-limit buckets.
It does not delete customer order or waitlist records. Agree on their retention,
deletion and backup rules before production.

## 4. Required payment verification

Using Stripe **test mode**, exercise:
- Matching checkout session id, currency, server-calculated quote
- Missing amount/session mismatch -> 500 (retry), no paid order
- Full and cumulative partial refunds with payment-intent ownership verified
- Duplicate and out-of-order webhooks; concurrent admin/feedback writes to D1
- Stripe signature rejection and HTTPS-only redirect
- Staging API returns correct 503/429 when dependencies are unready

Payments in production must remain disabled until the full staging flow passes.
