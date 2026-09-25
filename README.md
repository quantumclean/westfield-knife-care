# Westfield Knife Care

An experiment-driven MVP for a local knife sharpening service: a landing page,
a booking flow that charges through Stripe, a pilot waitlist, and a backend
that records every order as an experiment observation. Everything needed to
recreate the service lives in this repository except secrets and customer data.

```
apps/web             Landing page + booking UI (Vite, Preact, static build)
apps/api             HTTP API on Lambda (Hono, DynamoDB, Stripe Checkout)
packages/shared      Domain types, experiment registry, pricing, validation
packages/ui          Reusable Preact components + design tokens
infrastructure       Terraform: S3, CloudFront, Lambda, API Gateway, DynamoDB
docs                 Experiment plan, pricing tests, analytics events, ops
marketing            Print flyers and the homepage launch video (source + render scripts)
.github/workflows    test.yml (CI), deploy-staging.yml (manual), deploy.yml (prod, on push to main)
```

## How experiments work

Pricing, copy, offers and acquisition source are variables, not constants.

- `packages/shared/src/experiments.ts` is the registry. An **offer version**
  is copy, a **price version** is numbers, an **experiment** pairs one of each
  and takes a share of traffic. Two are live: `experiment-001` ($39 / 4
  knives, "Never cook with a dull knife again.") and `experiment-002` ($49 /
  5 knives, "Your knives. Sharp tomorrow.").
- The browser assigns each visitor deterministically (weighted hash of a
  visitor id) unless the URL says otherwise. A flyer's QR code should point
  at a vanity path (`/a`, `/b`, see `packages/shared/src/flyer-routes.ts`)
  that permanently pins its experiment, price and source; `?exp=` and
  `?src=&ch=` work the same way for placements with no fixed price to
  protect. First touch is remembered per browser, and a pin (vanity path or
  `?exp=`) is honored forever, even after the experiment concludes.
- The API snapshots `experiment_id`, `offer_version` and `price_version` on
  every order, signup and event, recomputes the price from the registry, and
  never trusts a price sent by the client.
- Every order records customer, source, offer_version, price_version,
  number_of_knives, care_day, payment_status, pickup_status, return_status,
  acquisition_channel, time_to_fulfill_hours, repeat_intent and
  actual_repeat_purchase. See `docs/data-model.md`.
- `GET /api/admin/summary` turns stored events and orders into a per-experiment
  funnel with revenue, conversion, channel split and repeat rates.

To run a new test: add an offer and/or price version, add an experiment that
uses them, open a pull request. Never edit a version that has received
traffic; add a new one and set the old experiment to `concluded`.

## Local development

Requirements: Node 22 and pnpm 10 (`corepack enable`).

```sh
pnpm install
cp .env.example .env        # optional; defaults simulate Stripe and use memory
pnpm dev                    # web on http://localhost:5173, api on :8787
```

Without a Stripe key the checkout is simulated: booking sends you straight to
the thank-you page and the order stays `pending`. To exercise real payments
locally, set `STRIPE_SECRET_KEY` (test mode) and run
`stripe listen --forward-to localhost:8787/api/webhooks/stripe`, then put the
printed signing secret in `STRIPE_WEBHOOK_SECRET`.

Useful commands:

```sh
pnpm test         # vitest in packages/shared and apps/api
pnpm typecheck    # tsc across the workspace
pnpm lint         # prettier --check
pnpm build        # web -> apps/web/dist, api -> apps/api/dist/index.mjs
```

Operator endpoints need the `x-admin-key` header (`ADMIN_API_KEY`):

```sh
curl -s localhost:8787/api/admin/summary -H "x-admin-key: $ADMIN_API_KEY" | jq
curl -s -X PATCH localhost:8787/api/admin/orders/<id> -H "x-admin-key: $ADMIN_API_KEY" \
  -H 'content-type: application/json' -d '{"pickup_status":"picked_up"}'
```

`docs/operations.md` covers the care-day routine end to end.

## API

All routes are under `/api` (served on the site's own domain via CloudFront).

| Method | Path                             | Purpose                                                |
| ------ | -------------------------------- | ------------------------------------------------------ |
| GET    | `/health`                        | Liveness                                               |
| GET    | `/config`                        | Active experiments, offers, prices, bookable care days |
| POST   | `/orders`                        | Create an order, returns a Stripe Checkout URL         |
| GET    | `/orders/:id`                    | Public status view for the thank-you page              |
| POST   | `/orders/:id/feedback`           | Customer answers "would you use us again?"             |
| POST   | `/waitlist`                      | Always Sharp pilot signup                              |
| POST   | `/events`                        | First-party analytics event                            |
| POST   | `/webhooks/stripe`               | Stripe webhook (signature verified)                    |
| GET    | `/admin/summary`                 | Per-experiment funnel and economics                    |
| GET    | `/admin/orders[?experiment_id=]` | Full order export                                      |
| PATCH  | `/admin/orders/:id`              | Record pickup, return, repeat intent, notes            |
| GET    | `/admin/waitlist`                | Waitlist export                                        |
| GET    | `/admin/events[?since=]`         | Raw event export                                       |

## Deployment (AWS, S3 + CloudFront + Lambda)

The site is served from a subdomain such as `sharp.example.com`; the main
domain and website are untouched. Staging (`dev.sharp.example.com`) and
production are fully separate stacks — separate bucket, table, function,
distribution and SSM path — created by the same Terraform with a different
`stage` variable, so exercising staging touches nothing in production.
**Deploy and exercise staging before production.** The full sequence,
including the manual walkthrough to run on staging (QR/vanity link →
landing page → experiment assignment → booking → Stripe → confirmation →
admin record → fulfillment → feedback) and the production go-live and
verification steps, is `docs/go-live.md`. Summary:

1. **Bootstrap state and CI credentials** (locally, with admin credentials):

   ```sh
   cd infrastructure/terraform/bootstrap
   cp terraform.tfvars.example terraform.tfvars   # set github_repository
   terraform init && terraform apply
   ```

   Note the `state_bucket` and `deploy_role_arn` outputs.

2. **Configure GitHub**: secret `AWS_DEPLOY_ROLE_ARN`; variables
   `AWS_REGION`, `TF_STATE_BUCKET`, `DOMAIN_NAME`, `STAGING_DOMAIN_NAME`, and
   optionally `HOSTED_ZONE_ID`, `STAGING_HOSTED_ZONE_ID` (Route53) and
   `VITE_GA4_MEASUREMENT_ID`. Create `staging` and `production` GitHub
   environments (the deploy role trusts both; `production` is the one worth
   protecting with a required reviewer).

3. **Deploy staging**: run the `Deploy staging` workflow (Actions tab →
   Run workflow), or apply `infrastructure/terraform` by hand with
   `environments/staging.tfvars.example` as a starting point. Work through
   the staging checklist in `docs/go-live.md` with Stripe **test mode**
   before touching production.

4. **Certificate and DNS** (each stage, same steps). With `HOSTED_ZONE_ID`
   set, Terraform creates the validation and alias records itself. With DNS
   elsewhere, run the first apply with
   `-target=module.cloudfront.aws_acm_certificate.site`, read the
   `acm_validation_records` output, create that CNAME, run the full apply,
   then point the subdomain at the `cloudfront_domain_name` output with a
   CNAME.

5. **Secrets** (each stage, its own SSM path). Terraform creates three SSM
   parameters with the value `unset`. Set the real values once (they are
   never in Git or state):

   ```sh
   aws ssm put-parameter --overwrite --type SecureString --name /wkc/prod/stripe_secret_key --value sk_live_...
   aws ssm put-parameter --overwrite --type SecureString --name /wkc/prod/stripe_webhook_secret --value whsec_...
   aws ssm put-parameter --overwrite --type SecureString --name /wkc/prod/admin_api_key --value "$(openssl rand -hex 24)"
   ```

   (Staging uses `/wkc/staging/...` and Stripe **test-mode** keys.) Then
   create the Stripe webhook endpoint at the `stripe_webhook_url` output for
   the events `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired` and
   `charge.refunded`. Redeploy (or update the function configuration) so the
   Lambda cold-starts with the new values.

6. **Deploy production**: once staging's full path is verified, push to
   `main`. `deploy.yml` runs tests, builds, applies Terraform, syncs
   `apps/web/dist` to S3 with immutable asset caching, invalidates
   CloudFront and hits `/api/health`. Then work through the production
   go-live checklist in `docs/go-live.md`: switch Stripe to live mode and
   make one real, refunded transaction to verify the live webhook,
   attribution and database records end to end.

Manual equivalent of either workflow, from `infrastructure/terraform`:

```sh
pnpm build
cp backend.hcl.example backend.hcl && terraform init -backend-config=backend.hcl
cp environments/staging.tfvars.example staging.tfvars   # or environments/production.tfvars.example
terraform apply -var-file=staging.tfvars
aws s3 sync ../../apps/web/dist s3://$(terraform output -raw site_bucket) --delete
aws cloudfront create-invalidation --distribution-id $(terraform output -raw cloudfront_distribution_id) --paths '/*'
```

## Design notes

- **Minimal on purpose.** One Lambda, one table, one bucket, one
  distribution. No framework beyond Hono and Preact. No ORM.
- **Server is the authority.** Prices, care-day availability and experiment
  resolution are recomputed in the API; the client only proposes.
- **Attribution is first-touch** and stored in the browser so a flyer scan
  that converts three days later still credits the flyer.
- **Secrets** live in SSM Parameter Store, loaded once per cold start.
- **Data retention**: analytics events expire after 180 days (DynamoDB TTL);
  orders and signups are kept. Point-in-time recovery is on.
- Replace `apps/web/public/images/hero.svg` with real photography before
  printing flyers; see the README in that folder.
