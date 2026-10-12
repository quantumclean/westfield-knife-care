-- Apply before the revised API and cleanup Worker. Idempotent; contains no contact data.
CREATE TABLE IF NOT EXISTS analytics_deletions (
  visitor_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, owner)
);
CREATE INDEX IF NOT EXISTS analytics_deletions_expiry_idx ON analytics_deletions(expires_at);
CREATE INDEX IF NOT EXISTS events_view_idx ON analytics_events(json_extract(data, '$.view_id'));
