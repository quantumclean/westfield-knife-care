# Scheduled D1 retention cleanup

The Pages API is a Pages Function; Cron Triggers run on a separate Cloudflare
Worker. This directory contains its code, **not** a deployed Worker.

1. Apply `migrations/0002_rate_limits.sql`, `migrations/0003_analytics_retention.sql`
   `migrations/0004_analytics_visitor_index.sql` and
   `migrations/0005_analytics_abuse.sql` to the **staging** D1 database.
2. Create a separate Worker named `westfield-knife-care-staging-cleanup`.
3. Configure a D1 binding called `DB` to the **staging** database only.
4. Set a daily Cron Trigger, for example `0 4 * * *` (UTC).
5. Deploy `workers/cleanup/src/index.ts` as the Worker's entrypoint.
6. In Cloudflare logs, confirm a scheduled execution succeeds.
7. Audit retention rules and backup requirements before repeating separately
   for a production database. Do not deploy with production D1 by accident.

The job deletes analytics older than 90 days (`EVENT_RETENTION_DAYS`; rows
written before migration 0003 had a 180-day expiry until it is applied) and
expired API rate-limit buckets and proof-specific analytics deletion tombstones.
Tombstones retain only the random visitor id and key hash for 90 days, prevent late
requests from recreating deleted events, and must be cleaned up by the revised Worker.
Apply 0005 **before** running the revised API or cleanup entrypoint.
Expired raw events remain physically present until cleanup succeeds; a passing unit
test is not evidence that a deployed Cron Trigger is running. Confirm the binding,
schedule and a successful execution separately before staging privacy acceptance.
Orders and waitlist records contain customer data and need an owner-
approved separate retention/deletion policy; this cleanup does not delete them.
