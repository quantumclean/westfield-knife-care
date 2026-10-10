-- Cloudflare D1 storage for Westfield Knife Care (staging first).
-- Orders/waitlist contain private customer data; never expose D1 to browser.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_email_idx ON orders(customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_experiment_idx ON orders(experiment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  email TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX IF NOT EXISTS waitlist_created_idx ON waitlist(created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX IF NOT EXISTS events_created_idx ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS events_expiry_idx ON analytics_events(expires_at);

-- Schedule periodic deletion before production, as D1 has no TTL enforcement:
-- DELETE FROM analytics_events WHERE expires_at <= CAST(strftime('%s', 'now') AS INTEGER);
