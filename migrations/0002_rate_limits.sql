-- Apply to staging D1 before deploying code that enables request limits.
-- Rate-limit rows hold a short-lived, salted hash of the connecting IP,
-- never the plaintext address. No customer contact details are stored.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket TEXT NOT NULL PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expires ON api_rate_limits(expires_at);
