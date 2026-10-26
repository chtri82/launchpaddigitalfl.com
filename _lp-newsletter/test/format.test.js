import test from 'node:test';
import assert from 'node:assert/strict';
import { topLocal, TOP_LOCAL } from '../src/counties.js';
import { buildIssue, checkSections, SECTION_MIN, SECTION_MAX } from '../src/sender.js';

const env = { PUBLIC_URL: 'https://api.example', POSTAL_ADDRESS: 'PO Box TEST', FROM_EMAIL: 'a@b.c' };
const sub = (county, cities = null) => ({ email: 'x@y.z', token: 't', county, cities: cities && JSON.stringify(cities), sections: JSON.stringify(['local', 'state', 'weather', 'sports', 'crime']) });
const POOL = [
  { title: 'Statewide A', url: 's1' },
  { title: 'Orange A', url: 'o1', counties: ['Orange'] },
  { title: 'Cocoa Beach A', url: 'c1', cities: ['Cocoa Beach'], counties: ['Brevard'] },
  { title: 'Titusville A', url: 't1', cities: ['Titusville'] },
  { title: 'Central region A', url: 'r1', counties: ['region:Central'] },
  { title: 'Statewide B', url: 's2', counties: ['statewide'] },
  { title: 'Escambia A', url: 'e1', counties: ['Escambia'] },
];
const t = (a) => a.map((s) => s.title);
const n = (k, c) => Array.from({ length: c }, (_, i) => ({ title: `${k}${i + 1}`, url: `${k}/${i}` }));

test('format constants: top 3 local, sections 2-5', () => {
  assert.equal(TOP_LOCAL, 3); assert.equal(SECTION_MIN, 2); assert.equal(SECTION_MAX, 5);
});
test('top local: chosen city, then county, then statewide', () => {
  assert.deepEqual(t(topLocal(POOL, { county: 'Brevard', cities: ['Cocoa Beach'] })), ['Cocoa Beach A', 'Titusville A', 'Statewide A']);
});
test('top local: county reader gets county stories then region then statewide', () => {
  assert.deepEqual(t(topLocal(POOL, { county: 'Seminole', cities: [] })), ['Orange A', 'Central region A', 'Statewide A']);
  assert.deepEqual(t(topLocal(POOL, { county: 'Orange', cities: [] })), ['Orange A', 'Central region A', 'Statewide A']);
});
test('top local: always 3 when pool has 3, even with nothing local', () => {
  assert.equal(topLocal(POOL, { county: 'Monroe' }).length, 3);
  assert.deepEqual(t(topLocal(POOL, null)), ['Statewide A', 'Statewide B', 'Orange A']);
  assert.equal(topLocal(POOL.slice(0, 2), { county: 'Leon' }).length, 2);
  assert.deepEqual(topLocal([], { county: 'Leon' }), []);
});
test('top local items carry their group label', () => {
  const r = topLocal(POOL, { county: 'Brevard', cities: ['Cocoa Beach'] });
  assert.deepEqual(r.map((s) => s.group), ['Cocoa Beach', 'Elsewhere in Brevard County', 'Statewide']);
});
test('checkSections trims >5, warns <2, omits 0, never throws', () => {
  const { issue, warnings } = checkSections({ sections: { local: POOL, state: n('st', 7), weather: n('w', 1), sports: [], crime: n('c', 3) } });
  assert.equal(issue.sections.state.length, 5);
  assert.equal(issue.sections.weather.length, 1);
  assert.ok(!('sports' in issue.sections));
  assert.equal(issue.sections.crime.length, 3);
  assert.equal(issue.sections.local.length, POOL.length, 'local pool untouched');
  assert.ok(warnings.some((w) => /weather: 1 .*minimum 2/.test(w)));
  assert.ok(warnings.some((w) => /sports: 0 .*omitted/.test(w)));
  assert.ok(warnings.some((w) => /state: 7 .*trimmed to 5/.test(w)));
  assert.ok(!warnings.some((w) => /^crime/.test(w)));
});
test('checkSections warns when local pool has fewer than 3', () => {
  assert.ok(checkSections({ sections: { local: POOL.slice(0, 1) } }).warnings.some((w) => /local: 1/.test(w)));
});
test('rendered email: Top Local Stories first with exactly 3, then sections capped at 5, empty omitted', () => {
  const m = buildIssue(env, { subject: 'S', sections: { local: POOL, state: n('ST', 6), weather: n('WX', 2), sports: [], crime: n('CR', 1) } }, sub('Brevard', ['Cocoa Beach']));
  const h2 = [...m.html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((x) => x[1]);
  assert.equal(h2[0], 'Top Local Stories');
  assert.ok(!h2.some((x) => /Sports/.test(x)));
  assert.ok(h2.some((x) => /Crime/.test(x)), 'under-minimum section still renders (warn only)');
  const top = m.text.split('== Top Local Stories ==')[1].split('==')[0];
  assert.equal((top.match(/^- /gm) || []).length, 3);
  assert.match(top, /\[Cocoa Beach\] Cocoa Beach A/);
  assert.ok(m.text.includes('ST5') && !m.text.includes('ST6'));
  assert.doesNotMatch(m.html, />Breaking local news</);
});
