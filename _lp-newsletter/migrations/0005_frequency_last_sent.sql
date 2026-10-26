-- Per-reader send tracking so each email covers everything published since THAT reader's last newsletter.
-- last_sent: JSON object {"daily": "2026-10-26 12:00:00", "weekly": ..., "monthly": ...} (one clock per frequency).
-- last_sent_at: most recent send of any frequency (reporting / export).
ALTER TABLE subscribers ADD COLUMN last_sent TEXT NOT NULL DEFAULT '{}';
ALTER TABLE subscribers ADD COLUMN last_sent_at TEXT;
-- Existing readers with no frequency chosen get the new default (weekly).
UPDATE subscribers SET frequencies = '["weekly"]' WHERE frequencies IS NULL OR frequencies = '[]';
