-- Multiple local-news locations per subscriber: JSON list of {"zip": "32931"|null, "county": "Brevard", "cities": [] (= all of county) | ["Cocoa Beach", ...]}.
-- NULL/[] = no location (statewide). The legacy zip/county/cities columns are kept and mirror the FIRST location (used for ordering/export).
ALTER TABLE subscribers ADD COLUMN locations TEXT;
UPDATE subscribers SET locations = json_array(json_object(
    'zip', zip,
    'county', county,
    'cities', CASE WHEN cities IS NOT NULL AND json_valid(cities) AND json_type(cities) = 'array' THEN json(cities) ELSE json('[]') END))
  WHERE county IS NOT NULL AND county <> '';
UPDATE subscribers SET locations = '[]' WHERE locations IS NULL;
