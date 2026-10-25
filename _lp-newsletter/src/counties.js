// The 67 Florida counties (official list, Florida Association of Counties / FL Dept. of State).
// REGIONS is Launchpad's own editorial grouping for "nearby" Local stories, not an official designation.
export const REGIONS = {
  Panhandle: ['Bay', 'Calhoun', 'Escambia', 'Franklin', 'Gadsden', 'Gulf', 'Holmes', 'Jackson', 'Jefferson', 'Leon', 'Liberty', 'Okaloosa', 'Santa Rosa', 'Wakulla', 'Walton', 'Washington'],
  North: ['Alachua', 'Baker', 'Bradford', 'Clay', 'Columbia', 'Dixie', 'Duval', 'Flagler', 'Gilchrist', 'Hamilton', 'Lafayette', 'Levy', 'Madison', 'Marion', 'Nassau', 'Putnam', 'St. Johns', 'Suwannee', 'Taylor', 'Union'],
  Central: ['Citrus', 'Lake', 'Orange', 'Osceola', 'Polk', 'Seminole', 'Sumter', 'Volusia'],
  'Space Coast': ['Brevard', 'Indian River'],
  'Tampa Bay': ['Hernando', 'Hillsborough', 'Manatee', 'Pasco', 'Pinellas', 'Sarasota'],
  South: ['Broward', 'Charlotte', 'Collier', 'DeSoto', 'Glades', 'Hardee', 'Hendry', 'Highlands', 'Lee', 'Martin', 'Miami-Dade', 'Monroe', 'Okeechobee', 'Palm Beach', 'St. Lucie'],
};
export const COUNTIES = Object.values(REGIONS).flat().sort();
export const regionOf = (c) => Object.keys(REGIONS).find((r) => REGIONS[r].includes(c)) || null;
export const normCounty = (v) => { const s = String(v ?? '').trim(); return COUNTIES.find((c) => c.toLowerCase() === s.toLowerCase()) || null; };

// Free official Census 2020 data, bundled (see data/fl-geo.json "source").
import GEO from '../data/fl-geo.json' with { type: 'json' };
export { GEO };
export const countiesForZip = (zip) => GEO.zips[String(zip ?? '').trim()] || [];
export const placesIn = (county) => (GEO.places[county] || []).map((p) => p.name);

// Validate a signup/preferences submission. Returns { zip, county, cities } (cities [] = all of county), all null if no ZIP.
export function resolveLocation(zipIn, countyIn, citiesIn) {
  const zip = String(zipIn ?? '').trim();
  const opts = /^\d{5}$/.test(zip) ? countiesForZip(zip) : [];
  if (!opts.length) return { zip: null, county: null, cities: null };
  const county = opts.includes(normCounty(countyIn)) ? normCounty(countyIn) : opts[0];
  const vals = [].concat(citiesIn ?? []).map(String);
  const valid = placesIn(county);
  const cities = vals.includes('all') ? [] : [...new Set(vals.filter((c) => valid.includes(c)))];
  return { zip, county, cities };
}

// Story tags: "cities": ["Cocoa Beach"] and/or "counties": ["Brevard"] | ["region:Central"] | ["statewide"].
// No tags = statewide. who = { county, cities } where cities [] or null = all of county.
// Order: your cities -> your county -> elsewhere in your county -> nearby region -> statewide -> rest. Never empty if any stories.
export function localGroups(items, who) {
  if (typeof who === 'string' || who == null) who = { county: who, cities: [] };
  const c = normCounty(who.county), reg = c && regionOf(c);
  const mine = Array.isArray(who.cities) ? who.cities : (who.cities ? JSON.parse(who.cities) : []);
  const local = c ? placesIn(c) : [];
  const ctys = (s) => (s.counties || []).map(String), cits = (s) => (s.cities || []).map(String);
  const isState = (s) => (!ctys(s).length && !cits(s).length) || ctys(s).some((t) => t.toLowerCase() === 'statewide');
  const storyCounties = (s) => [...ctys(s).map(normCounty), ...cits(s).flatMap((n) => COUNTIES.filter((k) => placesIn(k).includes(n)))].filter(Boolean);
  const cityHit = (s) => c && cits(s).some((n) => (mine.length ? mine.includes(n) : false) && local.includes(n));
  const countyWide = (s) => c && ctys(s).some((t) => normCounty(t) === c) && (!cits(s).length || !mine.length || cits(s).some((n) => mine.includes(n)));
  const inCounty = (s) => c && storyCounties(s).includes(c);
  const inRegion = (s) => reg && (ctys(s).includes('region:' + reg) || storyCounties(s).some((k) => regionOf(k) === reg));
  const used = new Set(), take = (f) => items.filter((s) => !used.has(s) && f(s) && used.add(s));
  const g = [], add = (label, arr) => arr.length && g.push({ label, items: arr });
  add(mine.length ? mine.join(', ') : '', take(cityHit));
  add(`${c} County`, take(mine.length ? countyWide : inCounty));
  add(`Elsewhere in ${c} County`, take(inCounty));
  add(`Nearby: ${reg}`, take(inRegion));
  add('Statewide', take(isState));
  add('Around Florida', take(() => true));
  return g;
}

// TOP LOCAL STORIES: the first n stories for this subscriber, in localGroups order
// (cities -> county -> elsewhere in county -> region -> statewide -> rest). Always n when the pool has n.
export const TOP_LOCAL = 3;
export function topLocal(items, who, n = TOP_LOCAL) {
  const out = [];
  for (const g of localGroups(items || [], who)) for (const s of g.items) if (out.length < n) out.push({ ...s, group: g.label });
  return out;
}
