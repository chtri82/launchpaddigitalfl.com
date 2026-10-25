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

// Validate one signup/preferences location. Returns { zip, county, cities } (cities [] = all of county), all null if invalid.
// A location is a Florida ZIP (county picked from that ZIP's counties) or, with no ZIP, a county picked from the list of 67.
export function resolveLocation(zipIn, countyIn, citiesIn) {
  const zip = String(zipIn ?? '').trim();
  const opts = /^\d{5}$/.test(zip) ? countiesForZip(zip) : [];
  let county = null;
  if (opts.length) county = opts.includes(normCounty(countyIn)) ? normCounty(countyIn) : opts[0];
  else if (!zip && normCounty(countyIn) && GEO.places[normCounty(countyIn)]) county = normCounty(countyIn);
  if (!county) return { zip: null, county: null, cities: null };
  const vals = [].concat(citiesIn ?? []).map(String);
  const valid = placesIn(county);
  const cities = vals.includes('all') ? [] : [...new Set(vals.filter((c) => valid.includes(c)))];
  return { zip: opts.length ? zip : null, county, cities };
}

// Validate a list of locations against fl-geo.json. Drops invalid entries; merges duplicate counties
// ("all of" wins, otherwise cities are unioned). Returns [] when nothing valid.
export const MAX_LOCATIONS = 67;
export function resolveLocations(list) {
  let arr = list;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
  if (!Array.isArray(arr)) arr = [];
  const out = [];
  for (const l of arr.slice(0, 200)) {
    if (!l || typeof l !== 'object') continue;
    const r = resolveLocation(l.zip, l.county, l.cities ?? []);
    if (!r.county) continue;
    const prev = out.find((o) => o.county === r.county);
    if (prev) { prev.cities = prev.cities.length && r.cities.length ? [...new Set([...prev.cities, ...r.cities])] : []; prev.zip = prev.zip || r.zip; continue; }
    if (out.length < MAX_LOCATIONS) out.push(r);
  }
  return out;
}

// A subscriber row's locations: the `locations` JSON list (migration 0004), else the legacy single zip/county/cities.
// Also accepts { county, cities } or a bare county string (older callers/tests).
export function subLocations(sub) {
  if (sub == null) return [];
  if (typeof sub === 'string') return resolveLocations([{ county: sub }]);
  if (sub.locations != null) return resolveLocations(sub.locations);
  if (!sub.county) return [];
  let cities = sub.cities;
  if (typeof cities === 'string') { try { cities = JSON.parse(cities); } catch { cities = []; } }
  const c = normCounty(sub.county);
  if (!c) return [];
  const valid = placesIn(c);
  return [{ zip: sub.zip || null, county: c, cities: (cities || []).filter((n) => valid.includes(n)) }];
}
// "Cocoa Beach (Brevard County); all of Orange County"
export const locationsLabel = (locs) => locs.map((l) => l.cities.length ? `${l.cities.join(', ')} (${l.county} County)` : `all of ${l.county} County`).join('; ');

const ctys = (s) => (s.counties || []).map(String), cits = (s) => (s.cities || []).map(String);
const isState = (s) => (!ctys(s).length && !cits(s).length) || ctys(s).some((t) => t.toLowerCase() === 'statewide');
const storyCounties = (s) => [...new Set([...ctys(s).map(normCounty), ...cits(s).flatMap((n) => COUNTIES.filter((k) => placesIn(k).includes(n)))].filter(Boolean))];
const storyRegions = (s) => [...new Set([...ctys(s).filter((t) => t.startsWith('region:')).map((t) => t.slice(7)).filter((r) => REGIONS[r]), ...storyCounties(s).map(regionOf)])];

// Story tags: "cities": ["Cocoa Beach"] and/or "counties": ["Brevard"] | ["region:Central"] | ["statewide"].
// No tags = statewide. who = subscriber row, { locations: [...] }, { county, cities } or a county string.
// Order across ALL the reader's locations: their cities -> their counties -> elsewhere in their counties
// -> nearby regions -> statewide -> rest. Never empty if any stories. Items keep pool order within a tier.
export function localGroups(items, who) {
  const locs = subLocations(who);
  const byCounty = Object.fromEntries(locs.map((l) => [l.county, l.cities]));
  const myCounties = locs.map((l) => l.county);
  const regs = [...new Set(myCounties.map(regionOf))];
  const cityMatch = (s) => cits(s).filter((n) => locs.some((l) => l.cities.includes(n)));
  const used = new Set(), g = [];
  const tier = (labelOf, f) => {
    const arr = [];
    for (const s of items) { if (used.has(s)) continue; const lab = f(s); if (lab === false || lab == null) continue; used.add(s); arr.push({ s, lab }); }
    if (!arr.length) return;
    const labs = [...new Set(arr.map((x) => x.lab))];
    g.push({ label: labelOf(labs), items: arr.map((x) => x.s), labels: arr.map((x) => x.lab) });
  };
  const join = (labs) => labs.join(', ');
  // 1. a chosen city
  tier(join, (s) => { const m = cityMatch(s); return m.length ? m.join(', ') : false; });
  // 2. county-wide for a chosen county (all-of-county readers: anything in the county)
  tier(join, (s) => {
    const sc = storyCounties(s);
    for (const c of myCounties) {
      const mine = byCounty[c];
      if (!mine.length ? sc.includes(c) : (ctys(s).some((t) => normCounty(t) === c) && !cits(s).length)) return `${c} County`;
    }
    return false;
  });
  // 3. elsewhere in a chosen county
  tier(join, (s) => { const c = myCounties.find((k) => storyCounties(s).includes(k)); return c ? `Elsewhere in ${c} County` : false; });
  // 4. nearby: same region as any chosen county
  tier(join, (s) => { const r = regs.find((k) => storyRegions(s).includes(k)); return r ? `Nearby: ${r}` : false; });
  tier(() => 'Statewide', (s) => isState(s) ? 'Statewide' : false);
  tier(() => 'Around Florida', () => 'Around Florida');
  return g;
}

// TOP LOCAL STORIES: the first n stories for this subscriber, in localGroups order
// (cities -> county -> elsewhere in county -> region -> statewide -> rest). Always n when the pool has n.
export const TOP_LOCAL = 3;
export function topLocal(items, who, n = TOP_LOCAL) {
  const out = [];
  for (const g of localGroups(items || [], who)) g.items.forEach((s, i) => { if (out.length < n) out.push({ ...s, group: g.labels[i] }); });
  return out;
}

// AROUND FLORIDA: every local story NOT in the reader's top block, grouped by region (fixed order), then Statewide.
// Nothing is dropped: each story lands in exactly one group (first region it is tagged to; untagged/statewide -> Statewide).
export const AROUND_ORDER = [...Object.keys(REGIONS), 'Statewide'];
export function placeLabel(s) {
  const sc = storyCounties(s);
  if (cits(s).length) return `${cits(s).join(', ')}${sc.length ? ` (${sc.map((c) => c + ' County').join(', ')})` : ''}`;
  if (sc.length) return sc.map((c) => c + ' County').join(', ');
  const r = storyRegions(s);
  if (r.length) return r.map((x) => x + ' region').join(', ');
  return 'Statewide';
}
export function aroundFlorida(items, top = []) {
  const shown = new Set(top.map((s) => s.url + '|' + s.title));
  const groups = Object.fromEntries(AROUND_ORDER.map((k) => [k, []]));
  for (const s of items || []) {
    if (shown.has(s.url + '|' + s.title)) continue;
    const r = isState(s) ? 'Statewide' : (storyRegions(s)[0] || 'Statewide');
    groups[r].push({ ...s, place: placeLabel(s) });
  }
  return AROUND_ORDER.filter((k) => groups[k].length).map((k) => ({ region: k, items: groups[k] }));
}
