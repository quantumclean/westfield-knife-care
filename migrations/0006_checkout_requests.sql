-- Apply before deploying code that writes checkout requests. Additive and idempotent;
-- existing orders are untouched. No customer data, feedback token or Checkout URL is stored.
-- Keep each minimal binding with its order; deleting it independently permits duplicates.
CREATE TABLE IF NOT EXISTS checkout_requests (
  request_key TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  site_origin TEXT NOT NULL,
  description TEXT NOT NULL,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkout_requests_order ON checkout_requests(order_id);
