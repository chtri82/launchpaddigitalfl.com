-- Email is weekly + monthly only (daily and breaking email dropped; those move to SMS).
UPDATE subscribers SET frequencies = (
  SELECT COALESCE(json_group_array(v), '[]') FROM (
    SELECT DISTINCT CASE WHEN value = 'daily' THEN 'weekly' ELSE value END AS v
    FROM json_each(subscribers.frequencies) WHERE value IN ('daily', 'weekly', 'monthly')
  )
) WHERE EXISTS (SELECT 1 FROM json_each(subscribers.frequencies) WHERE value IN ('daily', 'breaking'));
UPDATE subscribers SET frequencies = '["weekly"]' WHERE frequencies IS NULL OR frequencies = '[]';
-- SMS (optional, separate TCPA consent). phone_e164 like +13215551234.
ALTER TABLE subscribers ADD COLUMN phone_e164 TEXT;
ALTER TABLE subscribers ADD COLUMN sms_breaking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN sms_daily INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscribers ADD COLUMN sms_consent_at TEXT;
ALTER TABLE subscribers ADD COLUMN sms_consent_ip TEXT;
ALTER TABLE subscribers ADD COLUMN sms_consent_version TEXT;
ALTER TABLE subscribers ADD COLUMN sms_status TEXT;  -- NULL (no SMS) | pending | active | stopped
CREATE INDEX IF NOT EXISTS idx_sub_phone ON subscribers(phone_e164);
