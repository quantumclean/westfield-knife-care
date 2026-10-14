# Nightly quality gates

The nightly wrapper calls the existing PR `test.yml` through `workflow_call`; it does not
copy the expensive jobs. Schedule: `0 7 * * *` (07:00 UTC daily), plus manual dispatch.
Every executing job has a 30-minute timeout and read-only contents permission. Reusable
workflow call jobs do not accept `timeout-minutes`; the bound applies to both called jobs.
No secrets are inherited and no deployment/database/provider credentials are requested.

**Launch freeze:** leave this PR draft and unmerged. Scheduled workflows run only from the
default branch, so the nightly schedule is dormant while this branch is unmerged. A new
dispatch workflow also needs to exist on the default branch before GitHub offers dispatch.
The PR checks validate the reused jobs now. A workflow-only merge to main can trigger
Cloudflare production; activating the schedule requires a separate reviewed release decision.

## Coverage and diagnostics

The shared jobs run lint, typecheck, unit/API tests, web/API build, mocked Playwright checks,
and Terraform validation with its backend disabled. `test:database` runs the 200,000-event
analytics regression and a disposable disk-backed SQLite/D1-adapter waitlist persistence
test, including close/reopen and invalid-input rejection. It applies migrations locally only.
Gift/mail-in fields are absent on main; their persistence coverage belongs in PR #32, not
this CI PR. SQLite does not establish Cloudflare edge-runtime behavior.

Browser requests use synthetic fixtures and Apple SDK mocks. API proxy fallback points to
unused loopback port 9; GA4 is disabled. Failed browser traces are uploaded for three days;
only `.tmp/browser-results` and synthetic unit/database-suite JUnit reports are eligible. No environment dumps, raw databases, provider keys,
live requests, production build credentials or customer exports are included. Other step
failures have GitHub step logs; do not add broad workspace/log uploads. Do not run these tests
with real provider configuration or personal fixtures.

## Analytics timeout investigation

The scale test previously shared unrestricted Vitest file concurrency with API regressions.
Its synchronous SQLite inserts/queries can compete for CPU with those workers. It also checks
30-second aggregation and 5-second profile durations, independently of its 120-second test
timeout. These machine-dependent thresholds can fail before the test timeout; do not treat
every failure as the same cause.

The deterministic scheduling change moves scale coverage into `test:database`, excludes it
from ordinary `pnpm test`, and runs that suite with one worker and no file parallelism.
The 200,000 rows, bounded-result assertions, index-plan check, performance thresholds and
120-second timeout remain unchanged. SQL handles are closed in `finally`. This removes
intra-suite competition without duplicating scale work in PR/nightly runs. Record aggregation
timings from CI; if failures persist, inspect which assertion/time budget failed and profile
the query before changing thresholds. Local timing evidence is recorded in the PR.

Evidence: the latest inspected GitHub run `38572530349` passed with 6,308 ms aggregation
and 8,342 ms scale-test duration. The last 30 runs inspected had no non-success conclusion;
the reported occasional timeout was not reproduced or attributed to a confirmed failing
log. An isolated local run passed at 7,650 ms aggregation and 10,100 ms test duration.
Contention is a plausible contributor, not a proven historical root cause. Isolation is
the proposed fix; unchanged time budgets and future CI timings will test that hypothesis.
