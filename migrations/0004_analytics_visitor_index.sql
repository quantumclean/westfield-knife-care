-- Index analytics events by browser id (issue #29). Used by self-service deletion
-- (POST /api/events/forget) and by the paid-order device join in /api/admin/insights,
-- so neither scans the whole table. Owner-applied, staging first. Safe to re-run.
CREATE INDEX IF NOT EXISTS events_visitor_idx
  ON analytics_events (json_extract(data, '$.visitor_id'));
