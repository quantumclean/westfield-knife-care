# Cloudflare Pages + D1 staging API

This branch prepares, but does NOT deploy, the Cloudflare API or connect Stripe.
The Cloudflare Pages root must be the repository root and the build output is
`apps/web/dist`. The `functions/api/[[path]].ts` route serves `/api/*`.

## Setup

1. Run `npx --yes wrangler@latest d1 create westfield-knife-care-staging`.
2. Record the returned database UUID (not a secret).
3. Once this branch is available locally, apply both tracked migrations in order:
   `npx --yes wrangler@latest d1 execute westfield-knife-care-staging --remote --file migrations/0001_wkc_d1.sql`,
   then the corresponding command for `migrations/0002_rate_limits.sql`.
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
9. Configure a Preview secret named `RATE_LIMIT_SALT` with at least 32 random
   bytes. The API deliberately returns 503 for protected writes without it.

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
- Customer feedback is authorized by a per-order `feedback_token` (success URL and
  operator follow-up link only). Orders created before it was introduced cannot
  receive customer feedback; the operator records it via admin `PATCH`.
- Exercise optimistic-lock retries with the real staging D1 database under
  concurrent webhook, admin and feedback writes. Stripe event-id deduplication
  and an operator reconciliation procedure are still not implemented.
- Confirm application rate limits with real Preview traffic, then add the
  dashboard-managed WAF and Cloudflare Access policies before production.
- Deploy and observe the staging-only retention Worker. Customer order and
  waitlist retention/deletion rules and backup procedures remain undecided.
- Review support-email DNS, privacy notices and business policies.

Cloudflare Pages does NOT inherit CloudFront API routing. The Pages Function
is intentionally used instead of a static `/api` route. AWS Terraform is not used.

## Feedback token exposure (`ft=`)

The per-order `feedback_token` is a bearer secret that travels in the Stripe success URL
(`/thanks?order=<id>&ft=<token>&session_id=...`) and the operator's follow-up link.

Mitigations in place:

- `thanks.tsx` reads and validates `ft` first, before the session loads or any analytics
  runs, and removes it from the address bar with `history.replaceState`. The token is kept
  in memory only and sent in the feedback POST body, never in a URL.
- GA4 `page_location` is set explicitly to the URL without `ft` (config and every event);
  first-party `/events` records only `location.pathname`.
- `thanks.html` sets `<meta name="referrer" content="same-origin">`, so no third party
  receives a Referer for the thank-you document. Cloudflare Pages' default response policy
  is `strict-origin-when-cross-origin`.

Remaining limitations (not code-fixable here):

- The token is in the URL until the page script runs: it appears in Stripe's redirect
  (Stripe dashboard/logs of the configured success URL), Cloudflare Pages/edge request logs,
  and any browser history entry created _before_ the rewrite (the replaced entry is
  rewritten, but synced-history or extensions may have captured the original).
- An SMS/email follow-up link containing `ft` is as private as that channel.
- Anyone with the token can answer once (write-once); the operator corrects via admin
  `PATCH`. The token grants no read access to the order beyond the existing public view.
- Cloudflare Web Analytics or any other tag added later must be checked for URL capture.
