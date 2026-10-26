import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveLocations, subLocations, locationsLabel, localGroups, topLocal, aroundFlorida, placeLabel, AROUND_ORDER, countiesForZip } from '../src/counties.js';
import { buildIssue } from '../src/sender.js';

const env = { PUBLIC_URL: 'https://api.example', POSTAL_ADDRESS: 'PO Box TEST', FROM_EMAIL: 'a@b.c' };
const POOL = [
  { title: 'Statewide A', url: 's1', summary: 'sa' },
  { title: 'Orange A', url: 'o1', counties: ['Orange'], summary: 'oa' },
  { title: 'Orlando A', url: 'ol1', cities: ['Orlando'], counties: ['Orange'], summary: 'ola' },
  { title: 'Cocoa Beach A', url: 'c1', cities: ['Cocoa Beach'], counties: ['Brevard'], summary: 'ca' },
  { title: 'Brevard A', url: 'b1', counties: ['Brevard'], summary: 'ba' },
  { title: 'Central region A', url: 'r1', counties: ['region:Central'], summary: 'ra' },
  { title: 'Escambia A', url: 'e1', counties: ['Escambia'], summary: 'ea' },
  { title: 'Tampa A', url: 'tp1', counties: ['Hillsborough'], summary: 'ta' },
  { title: 'Miami A', url: 'm1', counties: ['Miami-Dade'], summary: 'ma' },
  { title: 'Duval A', url: 'd1', counties: ['Duval'], summary: 'da' },
];
const t = (a) => a.map((s) => s.title);
const row = (locations, sections = ['local']) => ({ email: 'x@y.z', token: 'f'.repeat(48), sections: JSON.stringify(sections), locations: JSON.stringify(locations) });

test('resolveLocations: ZIPs and county-list picks validated against fl-geo.json', () => {
  const r = resolveLocations([{ zip: '32931', cities: ['Cocoa Beach', 'Orlando'] }, { county: 'orange', cities: ['all'] }, { zip: '10001' }, { county: 'Atlantis' }, { county: '<x>' }, null, 'junk']);
  assert.deepEqual(r, [{ zip: '32931', county: 'Brevard', cities: ['Cocoa Beach'] }, { zip: null, county: 'Orange', cities: [] }]);
  assert.deepEqual(resolveLocations('not json'), []);
  assert.deepEqual(resolveLocations(undefined), []);
  const multi = countiesForZip('32008');
  assert.equal(resolveLocations([{ zip: '32008', county: multi[1] }])[0].county, multi[1]);
  assert.equal(resolveLocations([{ zip: '32008', county: 'Miami-Dade' }])[0].county, multi[0], 'county must belong to the ZIP');
});
test('resolveLocations merges duplicate counties (all-of wins, else union) and caps at 67', () => {
  assert.deepEqual(resolveLocations([{ county: 'Brevard', cities: ['Cocoa Beach'] }, { zip: '32780', cities: ['Titusville'] }]), [{ zip: '32780', county: 'Brevard', cities: ['Cocoa Beach', 'Titusville'] }]);
  assert.deepEqual(resolveLocations([{ county: 'Brevard', cities: ['Cocoa Beach'] }, { county: 'Brevard', cities: [] }])[0].cities, []);
  const all = JSON.parse(fs.readFileSync(new URL('../data/fl-geo.json', import.meta.url))).places;
  assert.equal(resolveLocations(Object.keys(all).flatMap((c) => [{ county: c }, { county: c }])).length, 67);
});
test('subLocations: new list column, legacy single columns, and plain county', () => {
  assert.deepEqual(subLocations({ locations: '[{"county":"Leon","cities":[]}]', county: 'Brevard' }), [{ zip: null, county: 'Leon', cities: [] }]);
  assert.deepEqual(subLocations({ zip: '32931', county: 'Brevard', cities: '["Cocoa Beach","Nowhere"]' }), [{ zip: '32931', county: 'Brevard', cities: ['Cocoa Beach'] }]);
  assert.deepEqual(subLocations({ county: null }), []);
  assert.deepEqual(subLocations({ locations: '[]' }), []);
  assert.deepEqual(subLocations('Orange'), [{ zip: null, county: 'Orange', cities: [] }]);
});
test('locationsLabel summarizes multiple locations', () => {
  assert.equal(locationsLabel([{ county: 'Brevard', cities: ['Cocoa Beach'] }, { county: 'Orange', cities: [] }]), 'Cocoa Beach (Brevard County); all of Orange County');
});
test('top 3 across all counties: cities first, then counties, then region, then statewide', () => {
  const who = { locations: [{ county: 'Brevard', cities: ['Cocoa Beach'] }, { county: 'Orange', cities: ['Orlando'] }] };
  const top = topLocal(POOL, who);
  assert.deepEqual(t(top), ['Orlando A', 'Cocoa Beach A', 'Orange A']);
  assert.deepEqual(top.map((s) => s.group), ['Orlando', 'Cocoa Beach', 'Orange County']);
  const g = localGroups(POOL, who);
  assert.deepEqual(t(g.flatMap((x) => x.items)).slice(0, 6), ['Orlando A', 'Cocoa Beach A', 'Orange A', 'Brevard A', 'Central region A', 'Statewide A']);
});
test('all-of-county readers in two counties get both counties before region', () => {
  const top = topLocal(POOL, { locations: [{ county: 'Brevard', cities: [] }, { county: 'Orange', cities: [] }] });
  assert.deepEqual(t(top), ['Orange A', 'Orlando A', 'Cocoa Beach A']);
  assert.deepEqual(top.map((s) => s.group), ['Orange County', 'Orange County', 'Brevard County']);
  assert.deepEqual(t(topLocal(POOL, { locations: [{ county: 'Seminole', cities: [] }, { county: 'Leon', cities: [] }] })), ['Orange A', 'Orlando A', 'Central region A']);
});
test('single-county behaviour unchanged through the list path', () => {
  assert.deepEqual(t(topLocal(POOL, { locations: [{ county: 'Brevard', cities: ['Cocoa Beach'] }] })), ['Cocoa Beach A', 'Brevard A', 'Statewide A']);
});
test('aroundFlorida: every non-top story exactly once, grouped by region in fixed order, statewide last', () => {
  const top = topLocal(POOL, { locations: [{ county: 'Brevard', cities: [] }] });
  const a = aroundFlorida(POOL, top);
  const flat = a.flatMap((g) => g.items);
  assert.equal(flat.length + top.length, POOL.length);
  assert.equal(new Set([...t(flat), ...t(top)]).size, POOL.length);
  assert.deepEqual(a.map((g) => g.region), ['Panhandle', 'North', 'Central', 'Tampa Bay', 'South']);
  const idx = a.map((g) => AROUND_ORDER.indexOf(g.region));
  assert.deepEqual(idx, [...idx].sort((x, y) => x - y));
  assert.deepEqual(t(a.find((g) => g.region === 'Central').items), ['Orange A', 'Orlando A', 'Central region A']);
  assert.ok(flat.every((s) => s.place && s.url && s.title));
});
test('placeLabel: county, city + county, region, statewide', () => {
  assert.equal(placeLabel(POOL[1]), 'Orange County');
  assert.equal(placeLabel(POOL[2]), 'Orlando (Orange County)');
  assert.equal(placeLabel(POOL[5]), 'Central region');
  assert.equal(placeLabel(POOL[0]), 'Statewide');
});
test('email: Around Florida block after sections, nothing dropped, multi-location footer', () => {
  const m = buildIssue(env, { subject: 'S', sections: { local: POOL, weather: [{ title: 'W1', url: 'w1' }, { title: 'W2', url: 'w2' }] } }, row([{ zip: '32931', county: 'Brevard', cities: [] }, { county: 'Orange', cities: ['Orlando'] }], ['local', 'weather']));
  const h2 = [...m.html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((x) => x[1]);
  assert.deepEqual(h2, ['Top Local Stories', 'Weather', 'Around Florida']);
  for (const s of POOL) assert.equal(m.text.split(s.title).length - 1, 1, `${s.title} appears exactly once`);
  const around = m.text.split('== Around Florida ==')[1];
  assert.match(around, /-- Panhandle --\n- \[Escambia County\] Escambia A\n  ea\n  Read more: e1/);
  assert.ok(around.indexOf('-- South --') < around.indexOf('-- Statewide --'));
  assert.match(m.html, /Read more<\/a>/);
  assert.match(m.html, /Local news set to all of Brevard County; Orlando \(Orange County\)\. Change/);
  assert.match(m.text, /Local news set to all of Brevard County; Orlando \(Orange County\)\. Change/);
});
test('email without local section has no Around Florida; no-location reader still gets everything', () => {
  const m = buildIssue(env, { subject: 'S', sections: { local: POOL, weather: [{ title: 'W1', url: 'w1' }] } }, row([], ['weather']));
  assert.doesNotMatch(m.html, /Around Florida/);
  const n = buildIssue(env, { subject: 'S', sections: { local: POOL } }, row([]));
  for (const s of POOL) assert.ok(n.text.includes(s.title));
  assert.match(n.html, /Add your ZIP for local news/);
});
test('migration 0004 adds locations and migrates legacy rows', () => {
  const sql = fs.readFileSync(new URL('../migrations/0004_locations.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN locations TEXT/);
  assert.match(sql, /json_array\(json_object\(/);
});
