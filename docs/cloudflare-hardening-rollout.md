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
- GET /api/orders/:id: 120 requests/minute per IP; after 30 missing-order
  responses per minute, further misses return 429. Successful reads remain
  available until the overall 120-request limit is reached.
- POST /api/orders/:id/feedback: 60 requests/minute per IP, plus 10 requests
  per minute for each IP and order pair. Different orders behind one shared IP
  have separate pair budgets.
- /api/admin/*: 30 requests/minute
- /api/webhooks/stripe: no IP throttle (signed Stripe retries must work)

The customer JSON body limits are 16 KiB for orders and waitlist, and 4 KiB for
events and feedback. Authenticated admin PATCH accepts up to 16 KiB. Stripe
webhooks have a separate 2 MiB body limit; signature verification and retries
are unchanged. Oversized bodies return 413, including streamed requests without
Content-Length. Malformed JSON returns 400.

This PR reuses `api_rate_limits` and `RATE_LIMIT_SALT`; it requires no new D1
migration or Cloudflare setting. Apply the existing `0002_rate_limits.sql` and
configure `RATE_LIMIT_SALT` before deploying to any environment that lacks them.
The Node development server has body limits but Pages is the rate-limit boundary.

A legitimate customer may still hit a 429 behind a very busy shared public IP;
review staging traffic and adjust the global budgets if needed. The 10-attempt
feedback limit is scoped to one IP and order, so separate customers on that IP
do not consume each other's small bucket. Add Cloudflare WAF rules and admin
Cloudflare Access policies before production (dashboard-managed; not set by this
PR).
The salt is used in the hash input; only hash values are stored.

Known order IDs still return the existing limited public view (first name,
booking status, care date, and price). The public view excludes email, phone,
address, and feedback token; unknown IDs receive only `not_found`. Feedback
with an incorrect token returns the same generic `forbidden` response for known
and unknown IDs. This PR does not change the existing order-read access model.

## 3. Daily retention cleanup

Deploy the **separate** staging Cron Worker only after reviewing the included
config: `workers/cleanup/wrangler.jsonc` includes the staging database id.
The config enables sampled Workers logs so a missed or failed cleanup can be
diagnosed in staging.

```powershell
npx --yes wrangler@latest deploy --config workers/cleanup/wrangler.jsonc
```

Before deployment, validate the bundle without changing Cloudflare state:

```powershell
npx --yes wrangler@latest deploy --dry-run --config workers/cleanup/wrangler.jsonc
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
