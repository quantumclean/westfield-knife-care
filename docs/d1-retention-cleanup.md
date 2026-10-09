# Scheduled D1 retention cleanup

The Pages API is a Pages Function; Cron Triggers run on a separate Cloudflare
Worker. This directory contains its code, **not** a deployed Worker.

1. Apply `migrations/0002_rate_limits.sql` to the **staging** D1 database.
2. Create a separate Worker named `westfield-knife-care-staging-cleanup`.
3. Configure a D1 binding called `DB` to the **staging** database only.
4. Set a daily Cron Trigger, for example `0 4 * * *` (UTC).
5. Deploy `workers/cleanup/src/index.ts` as the Worker's entrypoint.
6. In Cloudflare logs, confirm a scheduled execution succeeds.
7. Audit retention rules and backup requirements before repeating separately
   for a production database. Do not deploy with production D1 by accident.

The job deletes analytics older than 180 days and expired API rate-limit
buckets. Orders and waitlist records contain customer data and need an owner-
approved separate retention/deletion policy; this cleanup does not delete them.
