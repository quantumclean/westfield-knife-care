-- Analytics retention: 180 days -> 90 days (issue #29, docs/analytics-privacy.md).
-- The API writes a 90-day expires_at from the release that adds this file. This statement
-- brings rows written earlier under the same limit; the cleanup worker then deletes them.
-- Owner-applied, staging first. Safe to run more than once. Touches analytics_events only.
-- Irreversible: rows older than 90 days expire at once. Export any summary you need first.
-- A row whose created_at cannot be parsed keeps its existing expiry instead of failing the run.
UPDATE analytics_events
SET expires_at = MIN(
  expires_at,
  COALESCE(CAST(strftime('%s', created_at) AS INTEGER) + 90 * 86400, expires_at)
);
