-- Optional ZIP and chosen cities/towns (JSON array; [] = all of county). Used only to order the Local section.
ALTER TABLE subscribers ADD COLUMN zip TEXT;
ALTER TABLE subscribers ADD COLUMN cities TEXT;
