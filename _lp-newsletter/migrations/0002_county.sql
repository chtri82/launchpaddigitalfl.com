-- Optional county (one of Florida's 67) used only to order the Local section. NULL = not given.
ALTER TABLE subscribers ADD COLUMN county TEXT;
CREATE INDEX IF NOT EXISTS idx_sub_county ON subscribers(county);
