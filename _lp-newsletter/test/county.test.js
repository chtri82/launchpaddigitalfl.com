import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTIES, REGIONS, regionOf, normCounty, localGroups, resolveLocation, countiesForZip, placesIn, GEO } from '../src/counties.js';
import { buildIssue } from '../src/sender.js';

const env = { PUBLIC_URL: 'https://api.example', POSTAL_ADDRESS: 'PO Box TEST', FROM_EMAIL: 'a@b.c' };
const sub = (county, sections = ['local'], cities = null) => ({ email: 't@example.com', token: 'f'.repeat(48), sections: JSON.stringify(sections), county, cities: cities && JSON.stringify(cities) });
const L = [
  { title: 'Brevard story', url: 'https://x/b', counties: ['Brevard'] },
  { title: 'Orange story', url: 'https://x/o', counties: ['Orange'] },
  { title: 'Central region story', url: 'https://x/c', counties: ['region:Central'] },
  { title: 'Statewide story', url: 'https://x/s', counties: ['statewide'] },
];
const titles = (g) => g.flatMap((x) => x.items.map((i) => i.title));

test('official list: 67 unique counties, each in exactly one region', () => {
  assert.equal(COUNTIES.length, 67);
  assert.equal(new Set(COUNTIES).size, 67);
  assert.equal(Object.values(REGIONS).flat().length, 67);
  for (const c of ['Miami-Dade', 'St. Johns', 'St. Lucie', 'DeSoto', 'Santa Rosa', 'Indian River']) assert.ok(COUNTIES.includes(c));
});
test('normCounty accepts case variants, rejects junk and "Prefer not to say"', () => {
  assert.equal(normCounty('brevard'), 'Brevard');
  assert.equal(normCounty(' Miami-Dade '), 'Miami-Dade');
  assert.equal(normCounty(''), null);
  assert.equal(normCounty('Prefer not to say'), null);
  assert.equal(normCounty('<script>'), null);
  assert.equal(regionOf('Brevard'), 'Space Coast');
  assert.equal(regionOf('Orange'), 'Central');
});
test('own county first, then region, statewide, rest', () => {
  const g = localGroups(L, 'Orange');
  assert.deepEqual(g.map((x) => x.label), ['Orange County', 'Nearby: Central', 'Statewide', 'Around Florida']);
  assert.deepEqual(titles(g), ['Orange story', 'Central region story', 'Statewide story', 'Brevard story']);
});
test('county in same region counts as nearby', () => {
  const g = localGroups(L, 'Seminole');
  assert.equal(g[0].label, 'Nearby: Central');
  assert.deepEqual(g[0].items.map((i) => i.title), ['Orange story', 'Central region story']);
});
test('no county: statewide first, nothing dropped', () => {
  const g = localGroups(L, null);
  assert.equal(g[0].label, 'Statewide');
  assert.equal(titles(g).length, 4);
});
test('fallback: county with no local stories still gets a non-empty Local section', () => {
  const only = [L[0]];
  const g = localGroups(only, 'Escambia');
  assert.deepEqual(g.map((x) => x.label), ['Around Florida']);
  assert.equal(g[0].items.length, 1);
});
test('untagged stories are treated as statewide', () => {
  assert.equal(localGroups([{ title: 'x', url: 'u' }], 'Leon')[0].label, 'Statewide');
});
test('rendered email orders Local by county and shows change-county link', () => {
  const issue = { subject: 'S', sections: { local: L } };
  const m = buildIssue(env, issue, sub('Brevard'));
  assert.ok(m.html.indexOf('Brevard story') < m.html.indexOf('Statewide story'));
  assert.ok(m.html.indexOf('Statewide story') < m.html.indexOf('Orange story'));
  assert.match(m.html, /Local news set to all of Brevard County\. Change/);
  assert.match(m.text, /preferences\?token=f+#county/);
  const n = buildIssue(env, issue, sub(null));
  assert.match(n.html, /Add your ZIP for local news/);
  assert.ok(n.html.indexOf('Statewide story') < n.html.indexOf('Brevard story'));
});
test('non-local sections are not regrouped', () => {
  const m = buildIssue(env, { subject: 'S', sections: { weather: [{ title: 'W', url: 'u' }] } }, sub('Orange', ['weather']));
  assert.doesNotMatch(m.html, /Around Florida|Statewide/);
});

const C = [
  { title: 'Cocoa Beach story', url: 'u1', cities: ['Cocoa Beach'], counties: ['Brevard'] },
  { title: 'Titusville story', url: 'u2', cities: ['Titusville'] },
  { title: 'Brevard countywide', url: 'u3', counties: ['Brevard'] },
  { title: 'Orange story', url: 'u4', counties: ['Orange'] },
  { title: 'Statewide story', url: 'u5' },
];
test('bundled Census data: all 67 counties have places; ZIP lookups', () => {
  assert.deepEqual(Object.keys(GEO.places).sort(), [...COUNTIES].sort());
  assert.deepEqual(countiesForZip('32931'), ['Brevard']);
  assert.deepEqual(countiesForZip('32801'), ['Orange']);
  assert.ok(countiesForZip('32008').length > 1, 'multi-county ZIP');
  assert.deepEqual(countiesForZip('10001'), []);
  assert.ok(placesIn('Brevard').includes('Cocoa Beach') && placesIn('Brevard').includes('Merritt Island'));
});
test('resolveLocation validates zip, county choice and cities', () => {
  assert.deepEqual(resolveLocation('32931', '', ['Cocoa Beach', 'Orlando', '<x>']), { zip: '32931', county: 'Brevard', cities: ['Cocoa Beach'] });
  assert.deepEqual(resolveLocation('32931', 'Orange', ['all']), { zip: '32931', county: 'Brevard', cities: [] });
  const multi = countiesForZip('32008');
  assert.equal(resolveLocation('32008', multi[1], []).county, multi[1]);
  assert.deepEqual(resolveLocation('', null, []), { zip: null, county: null, cities: null });
  assert.deepEqual(resolveLocation('1234a', null, []).zip, null);
});
test('specific cities: city stories first, then county-wide, then elsewhere in county', () => {
  const g = localGroups(C, { county: 'Brevard', cities: ['Cocoa Beach'] });
  assert.deepEqual(g.map((x) => x.label), ['Cocoa Beach', 'Brevard County', 'Elsewhere in Brevard County', 'Statewide', 'Around Florida']);
  assert.deepEqual(titles(g), ['Cocoa Beach story', 'Brevard countywide', 'Titusville story', 'Statewide story', 'Orange story']);
});
test('all of county: every Brevard story (city-tagged too) in the county group', () => {
  const g = localGroups(C, { county: 'Brevard', cities: '[]' });
  assert.equal(g[0].label, 'Brevard County');
  assert.equal(g[0].items.length, 3);
});
test('city-only tag resolves to its county for region matching', () => {
  const g = localGroups([C[1]], { county: 'Indian River', cities: [] });
  assert.equal(g[0].label, 'Nearby: Space Coast');
});
