CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  sections TEXT NOT NULL DEFAULT '[]',      -- JSON array of section keys
  frequencies TEXT NOT NULL DEFAULT '[]',   -- JSON array: daily, weekly, monthly, breaking
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | active | unsubscribed
  tier TEXT NOT NULL DEFAULT 'free',        -- free | paid (Stripe hook)
  stripe_customer_id TEXT,
  token TEXT NOT NULL UNIQUE,               -- secret per-subscriber token for confirm/prefs/unsubscribe
  source TEXT,
  consent_ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON subscribers(status);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id TEXT NOT NULL, subscriber_id INTEGER NOT NULL,
  provider TEXT, status TEXT, error TEXT, sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(issue_id, subscriber_id)
);
