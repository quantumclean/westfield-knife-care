# Cloudflare Pages: frontend deployment notes

This covers the static site in `apps/web` on Cloudflare Pages. The API
(`functions/api/[[path]].ts`, D1, Stripe) is in `docs/cloudflare-api.md`;
read that first for bindings, secrets and the launch blockers it lists.

Everything marked **tested** was checked on 2026-10-09 against
`wrangler pages dev` (wrangler 4.149.0) serving the real `apps/web/dist` and
the real Pages Function with a local D1, plus headless Chrome driving the
production build. That emulator is not Cloudflare's edge, so the owner
checklist at the end still has to be run once on a real preview URL.

## Build settings

| Setting          | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Root directory   | Repository root (`functions/` lives there, not under `apps/web`)                        |
| Build command    | `pnpm --filter @wkc/web build`                                                          |
| Output directory | `apps/web/dist`                                                                         |
| Node             | `.node-version` (22); Pages reads that file                                             |
| Build variables  | Optional `VITE_GA4_MEASUREMENT_ID`. Leave `VITE_API_BASE_URL` unset (see below)         |
| Runtime secrets  | Never `VITE_*`: those are compiled into public JavaScript. See `docs/cloudflare-api.md` |

Use the filtered build, not `pnpm build`: the latter also bundles the AWS Lambda
(`apps/api/build.mjs`), which Pages does not use. Pages installs from
`pnpm-lock.yaml` before the build command; if the first build log shows it did
not, prefix the command with `pnpm install --frozen-lockfile &&`.

`VITE_API_BASE_URL` defaults to `/api`, which is the Pages Function on the same
origin. Setting it sends the browser to another origin and would need CORS.

## Routing (tested)

No `_redirects` file is needed. Pages serves a project with no root `404.html`
as a single-page app:

| Request                                   | Result                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| `/`, `/a`, `/b`, `/a?src=x`               | 200, the landing page; the app reads the path to pin the offer |
| `/thanks`, `/thanks?order=…&session_id=…` | 200, `thanks.html`, query string intact                        |
| `/thanks.html`, `/thanks/`                | 308 to `/thanks` (query kept)                                  |
| `/api/*`                                  | The Pages Function, `Cache-Control: no-store`                  |
| Unknown paths, e.g. `/nope`, `/x.png`     | 200, the landing page (a soft 404)                             |

Rules that keep this working (`apps/web/test/deploy-config.test.ts` enforces
the first two):

- Never add a root `404.html`; it turns the SPA fallback off and `/a` and `/b`
  would 404.
- Never add a static file or folder named like a flyer path (`a`, `a.html`,
  `b/`); it would shadow the route.
- Do not add `/* /index.html 200`; the fallback already does that.

Known edge: `/a/` and `/A` load the app but are **not** recognised as flyer
pins (`resolveFlyerRoute` matches exactly), so the visitor is assigned
randomly and attributed to `direct`. QR codes should encode the exact `/a` and
`/b`. See the audit report for the proposed fix.

## Headers (tested)

`apps/web/public/_headers` becomes `dist/_headers`:

| Rule        | Header                                               | Why                                                            |
| ----------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| `/*`        | `X-Frame-Options: DENY`                              | Nothing embeds the site and the app embeds nothing             |
| `/assets/*` | `Cache-Control: public, max-age=31536000, immutable` | Vite content-hashes these names; Pages defaults to `max-age=0` |

Pages already adds `X-Content-Type-Options: nosniff` and
`Referrer-Policy: strict-origin-when-cross-origin`, so they are deliberately not
repeated (a repeat would be joined into a duplicate value). HTML keeps
`max-age=0, must-revalidate`, so a new deploy is picked up immediately. The
header test pins this file to exactly these rules.

Checked with the headers active, driving the production build in Chrome:

| Concern               | What was checked                                                                                                     | Result                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| API connectivity      | `/api/config`, `/api/events`, `/api/orders` from the page; DB unbound, payments off, and payments on (forced config) | All same-origin, none blocked; errors shown as plain-language text |
| Stripe redirect       | Submit, `window.location.assign` to Checkout, then `success_url` `/thanks?…` and `cancel_url` `/?…&cancelled=1#book` | Top-level navigations only; both return URLs render correctly      |
| Framing               | Searched for `iframe`, `frame`, `object`, `embed`                                                                    | None; `X-Frame-Options: DENY` cannot affect Stripe Checkout        |
| HTTPS / mixed content | Every request in the flow, plus every `http://` string in the build                                                  | No insecure subresource; the strings are XML namespace identifiers |
| Frontend resources    | JS, CSS, favicon, hero image, `robots.txt` on `/`, `/a`, `/b`, `/thanks`                                             | All 200 with the headers above; no console errors                  |

**Not added, on purpose.** Neither could be validated locally, and both are
hard to undo:

- **HSTS** is a Cloudflare zone setting (SSL/TLS, Edge Certificates, HSTS). The
  old CloudFront policy sent `max-age=31536000; includeSubdomains; preload`.
  Turn it on after `https://sharp.usabiology.com` is verified, starting with a
  short `max-age`. Do not add `preload` until the owner has chosen to submit
  the domain.
- **Content-Security-Policy.** Draft it as `Content-Security-Policy-Report-Only`
  first. Origins it must allow, none of which were exercised here: `'self'`
  for scripts, styles, images and `connect-src`; and, only if
  `VITE_GA4_MEASUREMENT_ID` is set, `https://www.googletagmanager.com` and
  `https://*.google-analytics.com`. Stripe Checkout is a full-page redirect, so
  it needs no CSP entry.

API responses from the Function carry no `nosniff` or `Referrer-Policy`
(Pages only adds those to static assets). That is in `apps/api`, so it is
listed for the owner rather than changed here.

## Preview deployments and `SITE_URL`

`handlePagesApi` enables payments only when `SITE_URL` is exactly the HTTPS
origin the request arrived on. Every preview has a per-deployment URL and a
branch alias, so only the one that equals `SITE_URL` can take a test payment.
Open that URL, not the other alias.

## Run it locally without credentials

From the repository root, after `pnpm install` and `pnpm --filter @wkc/web build`:

```sh
npx wrangler@4.149.0 d1 execute DB --local --persist-to .tmp/state \
  --config .tmp/wrangler.toml --file migrations/0001_wkc_d1.sql
npx wrangler@4.149.0 pages dev apps/web/dist --d1 DB=<database_id from .tmp/wrangler.toml> \
  --persist-to .tmp/state --compatibility-flag nodejs_compat --compatibility-date 2026-10-01
```

`.tmp/wrangler.toml` only needs a `[[d1_databases]]` entry with binding `DB`
and any placeholder `database_id`. Do not commit it, do not paste Stripe keys
into it, and never add a `wrangler.toml` at the repository root: Pages would
then take its bindings from that file instead of the dashboard settings that
`docs/cloudflare-api.md` describes. Without a Stripe key `/api/config` reports
`payments_enabled: false`, and the booking form stays closed in this build.
`pnpm dev` is the way to try simulated checkout.

## Owner checklist on the first real preview

1. `curl -sI https://<preview>/assets/<any hashed file>` shows `immutable`.
2. `https://<preview>/a` and `/b` show $39 / 4 knives and $49 / 5 knives, and
   `localStorage` has the matching `wkc.experiment_id`.
3. `/thanks?order=x` shows the thank-you page, not the landing page.
4. `/api/health` returns JSON; `/api/config` has `payments_enabled: false`
   before Stripe test keys and `true` after.
5. With the Pages project's custom domain: `http://` redirects to `https://`,
   then add HSTS in the zone settings.
6. Run the table in `docs/go-live.md` 1.4 against the preview with test cards.
   It is written for AWS, so substitute the Pages URL and read orders through
   `/api/admin/*`.

## Out of date elsewhere

`README.md`, `docs/go-live.md` and `docs/operations.md` still describe the AWS
stack (S3, CloudFront, Lambda, the `v1.0.0` tag). `deploy.yml` no longer
deploys it. Updating them is a documentation decision for the owner.
