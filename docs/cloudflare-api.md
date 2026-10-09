# Cloudflare Pages + D1 staging API

This branch prepares, but does NOT deploy, the Cloudflare API or connect Stripe.
The Cloudflare Pages root must be the repository root and the build output is
`apps/web/dist`. The `functions/api/[[path]].ts` route serves `/api/*`.

## Setup

1. Run `npx --yes wrangler@latest d1 create westfield-knife-care-staging`.
2. Record the returned database UUID (not a secret).
3. Once this branch is available locally, run:
   `npx --yes wrangler@latest d1 execute westfield-knife-care-staging --remote --file migrations/0001_wkc_d1.sql`.
4. In Cloudflare Pages project Settings > Bindings, add a Preview **D1 database**
   binding named `DB` to `westfield-knife-care-staging`. Redeploy Preview.
5. In Settings > Functions > Compatibility flags, enable `nodejs_compat`
   with a current compatibility date. This is required by the current admin
   endpoint's `node:crypto` implementation.
6. For Preview, set runtime variable `STAGE=staging` and `SITE_URL` to the
   exact HTTPS origin of the preview URL. Do not use your live domain yet.
7. Set test-only runtime secrets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
   only after the staging backend is reviewed. Do NOT use `VITE_` prefixes.
8. Configure a distinct, random ADMIN_API_KEY for each environment.

Production must use a SEPARATE D1 database and `STAGE=production`; production
requires a live-mode Stripe key and a matching configured HTTPS site origin.
Never share D1 bindings between Preview and Production.

## Validation before any real customer data

- Unbound database or missing migration returns HTTP 503 JSON.
- GET `/api/health` returns JSON `{ ok: true }` after DB setup.
- GET `/api/config` must report `payments_enabled:false` before test keys.
- POST `/api/orders` must return HTTP 503 until test Stripe is configured.
- Test Checkout amount, signed webhook, replay, expiry, refund, session
  matching and reconciliation before going live.

## Launch blockers

- No production release without full Pages runtime and Stripe test validation.
- Existing order writes are last-write-wins; concurrent webhooks still need
  reconciliation and stronger deduplication before live use.
- Add rate limiting and operational access control to `/api/*` and `/api/admin/*`.
- Establish customer data retention/deletion, monitoring, backups, and
  scheduled analytics expiry cleanup before production.
- Review support-email DNS, privacy notices and business policies.

Cloudflare Pages does NOT inherit CloudFront API routing. The Pages Function
is intentionally used instead of a static `/api` route. AWS Terraform is not used.
