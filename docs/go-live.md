# Go-live runbook: staging, then production

Deploy and fully exercise staging before production ever sees a real
customer or a live Stripe key. This doc is the checklist for both. It
assumes `infrastructure/terraform/bootstrap` has already been applied once
(see the README's Deployment section) and GitHub has the secrets/variables
it lists.

Nothing in this repo can run these steps for you: they need real AWS
credentials, a real domain you control, and a real Stripe account. Where a
step needs something only you can provide, it says so explicitly.

## Part 1 — Staging

Goal: prove the entire path works, end to end, against Stripe **test
mode**, before anything is customer-facing.

### 1.1 Configure

In GitHub → Settings → Secrets and variables → Actions:

- Secret `AWS_DEPLOY_ROLE_ARN` (from the bootstrap output — shared with prod).
- Variables `AWS_REGION`, `TF_STATE_BUCKET` (shared with prod), and
  `STAGING_DOMAIN_NAME` set to a subdomain you control, e.g.
  `dev.sharp.<yourdomain>.com`. Optionally `STAGING_HOSTED_ZONE_ID` if that
  domain's DNS is a Route53 zone in this AWS account.
- Create a `staging` GitHub environment (Settings → Environments). No
  required reviewer is necessary here — this stage never touches real
  money or real customers — but you can add one if you want a manual gate.

### 1.2 Deploy

GitHub → Actions → **Deploy staging** → Run workflow. This applies
Terraform with `stage=staging` (a fully separate bucket, table, function,
distribution and certificate from prod — see `infrastructure/README.md`),
builds and publishes the site, and runs a health check.

If `STAGING_HOSTED_ZONE_ID` was left empty, the run's Terraform apply will
still succeed but the certificate needs a manual DNS validation record
first — see the README's "Certificate and DNS" step, using the
`acm_validation_records` output from
`terraform output -raw acm_validation_records` (run against the staging
state: `terraform init -backend-config="key=staging/terraform.tfstate" ...`
or just re-run the workflow after adding the CNAME; it's idempotent).

### 1.3 Connect Stripe (test mode)

1. In the Stripe dashboard, switch to **test mode** (top-left toggle).
2. Copy the test-mode secret key (`sk_test_...`).
3. Set the staging SSM parameters:
   ```sh
   aws ssm put-parameter --overwrite --type SecureString --name /wkc/staging/stripe_secret_key --value sk_test_...
   aws ssm put-parameter --overwrite --type SecureString --name /wkc/staging/admin_api_key --value "$(openssl rand -hex 24)"
   ```
4. In Stripe (test mode) → Developers → Webhooks → Add endpoint: use the
   staging `stripe_webhook_url` Terraform output
   (`https://dev.sharp.<yourdomain>/api/webhooks/stripe`). Select
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`. Copy the signing secret (`whsec_...`) and set it too:
   ```sh
   aws ssm put-parameter --overwrite --type SecureString --name /wkc/staging/stripe_webhook_secret --value whsec_...
   ```
5. Re-run **Deploy staging** (or just update the Lambda's function code —
   redeploy is simplest) so the next cold start picks up the new secrets.

### 1.4 Walk the whole path

Do every one of these yourself, on staging, before touching production.
Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

| #   | Step                                                                                                                                                                     | Where to look                          | Expect                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Open `https://dev.sharp.<yourdomain>/a` in a private/incognito window                                                                                                    | The page itself                        | Headline "Never cook with a Dull Knife again.", $39/4 knives shown                                                  |
| 2   | Open `https://dev.sharp.<yourdomain>/b` in a **different** private window                                                                                                | The page itself                        | Headline "Your Knives. Sharp Tomorrow.", $49/5 knives shown                                                         |
| 3   | On the `/a` tab, open dev tools → Application → Local Storage                                                                                                            | `wkc.experiment_id`, `wkc.attribution` | `experiment-001`; `{"source":"flyer-a","acquisition_channel":"print"}`                                              |
| 4   | Click "Sharpen My Knives", fill the form, submit                                                                                                                         | Redirects to Stripe Checkout           | The Checkout page shows the **same total** the booking form quoted                                                  |
| 5   | Pay with the Stripe test card                                                                                                                                            | Redirects to `/thanks?order=...`       | Shows "Thank you", your first name, the right total, care day                                                       |
| 6   | Wait a few seconds, refresh `/thanks`                                                                                                                                    | The status line                        | `payment_status: paid` (it starts `pending` until the webhook lands)                                                |
| 7   | `curl -s https://dev.sharp.<yourdomain>/api/admin/summary -H "x-admin-key: $ADMIN_API_KEY"`                                                                              | JSON response                          | `experiment-001.orders_paid` incremented, `revenue_cents` includes 3900                                             |
| 8   | `curl -s https://dev.sharp.<yourdomain>/api/admin/orders -H "x-admin-key: $ADMIN_API_KEY"`                                                                               | The order record                       | `source: "flyer-a"`, `acquisition_channel: "print"`, correct `quote.total_cents`, a real `stripe_payment_intent_id` |
| 9   | `curl -X PATCH .../api/admin/orders/<id> -H "x-admin-key: ..." -d '{"pickup_status":"picked_up"}'`                                                                       | Response                               | `picked_up_at` is set                                                                                               |
| 10  | `curl -X PATCH .../api/admin/orders/<id> -d '{"return_status":"returned"}'`                                                                                              | Response                               | `returned_at` set, `time_to_fulfill_hours` computed                                                                 |
| 11  | Visit `/thanks?order=<id>&feedback=1`, click a repeat-intent button                                                                                                      | The admin order record                 | `repeat_intent` updated                                                                                             |
| 12  | Repeat steps 1–6 for `/b`, and once more for `/a` from **direct** navigation with no path (`https://dev.sharp.<yourdomain>/`) a few times from different private windows | `acquisition_channel` on those orders  | Roughly split between `experiment-001` and `experiment-002` (weighted 1:1), `source: "direct"`                      |
| 13  | In Stripe test mode, refund the test payment                                                                                                                             | The order record                       | `payment_status: refunded`                                                                                          |
| 14  | Check CloudWatch Logs for the Lambda (`terraform output -raw log_group_name` for staging)                                                                                | Recent log lines                       | `order.created`, `order.payment_updated`, no `request.error` entries                                                |

If any row fails, fix it on staging and redo that row — don't move to
production with an open question about how the pipeline behaves.

### 1.5 Load-bearing checks specific to this launch

- Confirm `/a` and `/b` **still work after a hard refresh and after
  clearing cookies/local storage** — this proves the CloudFront 403→
  index.html fallback is actually in place (see the PR #1 review comment;
  without it, `/a` and `/b` 404/403 instead of loading the app).
- Confirm the browser network tab shows requests to `/api/...` on the
  **same origin** as the page (not CORS to a different domain) — this
  proves the CloudFront `/api/*` behavior is routing to the Lambda.

## Part 2 — Production

Only start this once every row above passed on staging.

### 2.1 Configure and deploy

Same as staging (`DOMAIN_NAME`, `HOSTED_ZONE_ID`, the `production` GitHub
environment — add a required reviewer here, this one's worth gating).
Push to `main`; `deploy.yml` runs automatically. Or trigger it manually via
Actions if the branch is already on `main`.

### 2.2 Switch Stripe to live mode

1. Stripe dashboard → toggle off test mode.
2. Copy the **live** secret key (`sk_live_...`).
3. Set the prod SSM parameters (same three names, `/wkc/prod/...` prefix,
   live key instead of test key — see the README's Secrets step).
4. Add the live-mode webhook endpoint at the prod `stripe_webhook_url`
   output, same five events. Set `/wkc/prod/stripe_webhook_secret` to the
   live signing secret.
5. Redeploy so the Lambda cold-starts with live credentials.

### 2.3 Make one real, verified transaction

Book a real order yourself, with a real card, for the smallest bundle
(experiment-001, $39/4 knives) — or if your Stripe setup allows a bench/test
transaction in live mode that your processor will let you cancel before
settlement, use that instead. Otherwise: book it, verify it end-to-end
(below), then refund it from the Stripe dashboard.

Run through table 1.4 again, but against `https://sharp.<yourdomain>` and
watching for these production-specific things:

- The Stripe dashboard shows the charge in **live** mode, not test mode.
- The webhook delivery in Stripe (Developers → Webhooks → your live
  endpoint → recent deliveries) shows a `200` response, not a retry or
  failure.
- `GET /api/admin/orders` on production shows the order with the correct
  `source`/`acquisition_channel` for however you accessed it, and
  `payment_status` moves from `pending` to `paid` to `refunded` as you
  complete each step.
- The CloudWatch alarm `wkc-prod-api-errors` stays in `OK` state
  throughout (CloudWatch → Alarms).

### 2.4 After the real transaction verifies

1. Refund it (if you didn't use a true test mechanism).
2. Confirm the refunded order shows `payment_status: refunded` and is
   **excluded** from `orders_paid`/`revenue_cents` in
   `GET /api/admin/summary`'s next read (`applyPaymentEvent` in
   `apps/api/src/services/orders.ts` sets `payment_status` to `refunded`,
   and the summary only counts `paid`/`refunded` toward `orders_paid` —
   check this matches what you actually want reported; if you'd rather a
   refunded test order not count at all, delete it manually from DynamoDB
   before Wave 1 traffic starts, since there is no delete-order API by
   design).
3. Read `docs/launch-freeze.md`: from here on, only launch-blocking fixes
   until the experiment concludes.
4. Print and distribute the flyers (`marketing/flyers/README.md`,
   `docs/wave-1-route.md`) — **regenerate them against the real production
   domain first** if you haven't already.
5. Start the weekly review rhythm in `docs/operations.md`.

## If something breaks mid-launch

`docs/operations.md`'s Incidents section covers the common cases (site
down, API 5xx, lost admin key, rollback). For anything Stripe-specific,
Stripe's dashboard event log for the relevant object (Checkout Session,
PaymentIntent, or the webhook endpoint's delivery log) is almost always the
fastest way to see what actually happened.
