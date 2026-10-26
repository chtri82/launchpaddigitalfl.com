import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIssue, sinceFor, filterSince, sendIssue, WINDOW_DAYS, CONDENSED, MONEY_NOTE } from '../src/sender.js';

const env = { PUBLIC_URL: 'https://api.example', POSTAL_ADDRESS: '123 Test St, Palm Bay, FL', FROM_EMAIL: 'a@b.c', EMAIL_PROVIDER: 'log' };
const NOW = Date.parse('2026-10-26T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const sub = (extra = {}) => ({ id: 1, email: 'x@y.z', token: 't', locations: '[{"county":"Brevard","cities":[]}]', sections: JSON.stringify(['local', 'state', 'money', 'sports']), last_sent: '{}', ...extra });
const n = (k, c, h = 2) => Array.from({ length: c }, (_, i) => ({ title: `${k}${i + 1}`, url: `https://x/${k}/${i}`, summary: `${k} summary one. Second sentence that should be cut.`, published_at: ago(h) }));
const ISSUE = { subject: 'S', frequency: 'weekly', sections: {
  local: [...n('BR', 4).map((s) => ({ ...s, counties: ['Brevard'] })), ...n('MI', 2).map((s) => ({ ...s, counties: ['Miami-Dade'] }))],
  state: n('ST', 6), money: n('MO', 3), sports: n('SP', 2) } };

test('sinceFor: last send for that frequency, else frequency window', () => {
  assert.equal(sinceFor(sub({ last_sent: '{"weekly":"2026-10-20 12:00:00"}' }), 'weekly', NOW), Date.parse('2026-10-20T12:00:00Z'));
  assert.equal(sinceFor(sub({ last_sent: '{"daily":"2026-10-25 12:00:00"}' }), 'weekly', NOW), NOW - 7 * 86400000, 'daily clock does not affect weekly');
  assert.equal(sinceFor(sub(), 'monthly', NOW), NOW - WINDOW_DAYS.monthly * 86400000);
  assert.equal(sinceFor(sub({ last_sent: 'garbage' }), 'daily', NOW), NOW - 86400000);
});
test('filterSince drops older stories, keeps undated ones', () => {
  const r = filterSince({ sections: { state: [{ title: 'old', published_at: ago(48) }, { title: 'new', published_at: ago(1) }, { title: 'undated' }], sports: [{ title: 'old', published_at: ago(48) }] } }, NOW - 24 * 3600000, NOW);
  assert.deepEqual(r.sections.state.map((s) => s.title), ['new', 'undated']);
  assert.ok(!('sports' in r.sections));
});
test('per-recipient: a reader last sent 1h ago gets only newer stories', () => {
  const iss = { ...ISSUE, frequency: 'daily', sections: { state: [{ title: 'Before', url: 'u1', published_at: ago(3) }, { title: 'After', url: 'u2', published_at: ago(0.5) }] } };
  const s = sub({ sections: '["state"]', last_sent: JSON.stringify({ daily: new Date(NOW - 3600000).toISOString() }) });
  const m = buildIssue(env, iss, s, { frequency: 'daily', since: sinceFor(s, 'daily', NOW), now: NOW });
  assert.ok(m.text.includes('After') && !m.text.includes('Before'));
  assert.equal(buildIssue(env, iss, s, { frequency: 'daily', since: NOW, now: NOW }), null, 'nothing new = no email');
});
test('daily: full format (sections up to 5, full summary, Around Florida)', () => {
  const m = buildIssue(env, ISSUE, sub(), { frequency: 'daily' });
  assert.ok(m.text.includes('ST5') && !m.text.includes('ST6'));
  assert.match(m.text, /Second sentence/);
  assert.match(m.text, /== Around Florida ==/);
  assert.doesNotMatch(m.text, /== More stories ==/);
});
test('weekly/monthly: condensed top 3 local, 1-2 per section, one-line summary, More stories list', () => {
  for (const f of ['weekly', 'monthly']) {
    const m = buildIssue(env, ISSUE, sub(), { frequency: f });
    const sec = (name) => m.text.split(`== ${name} ==`)[1].split('==')[0];
    assert.equal((sec('Top Local Stories').match(/^- /gm) || []).length, 3);
    assert.equal((sec('Florida (state) news').match(/^- /gm) || []).length, CONDENSED.perSection);
    assert.doesNotMatch(m.text, /Second sentence/);
    assert.match(m.text, /ST summary one\./);
    const more = sec('More stories');
    assert.match(more, /Florida \(state\) news: ST6/);
    assert.match(more, /Around Florida · .*BR4|Around Florida · .*MI1/);
    assert.doesNotMatch(m.text, /== Around Florida ==/);
  }
});
test('condensed caps More stories and links to the site', () => {
  const m = buildIssue(env, { ...ISSUE, sections: { state: n('ST', 40) } }, sub({ sections: '["state"]' }), { frequency: 'weekly' });
  assert.equal((m.text.split('== More stories ==')[1].match(/^- /gm) || []).length, CONDENSED.moreMax);
  assert.match(m.text, /\+ 13 more on the site/);
});
test('Money note, CAN-SPAM address and unsubscribe in every frequency', () => {
  for (const f of ['daily', 'weekly', 'monthly']) {
    const m = buildIssue(env, ISSUE, sub(), { frequency: f });
    assert.ok(m.text.includes(MONEY_NOTE) && m.html.includes(MONEY_NOTE));
    assert.ok(m.text.includes(env.POSTAL_ADDRESS));
    assert.match(m.text, /Unsubscribe: https:\/\/api\.example\/unsubscribe\?token=t/);
    assert.ok(m.headers['List-Unsubscribe']);
  }
});
test('sendIssue filters per subscriber and records last_sent for that frequency', async () => {
  const runs = [];
  const subs = [sub({ id: 1, sections: '["state"]' }), sub({ id: 2, sections: '["state"]', last_sent: JSON.stringify({ weekly: new Date().toISOString() }) })];
  const DB = { prepare: (sql) => ({ bind: (...a) => ({ run: async () => runs.push({ sql, a }), all: async () => ({ results: subs }), first: async () => ({ n: 0 }) }), first: async () => ({ n: 0 }) }) };
  const iss = { id: 'w1', subject: 'S', frequency: 'weekly', sections: { state: [{ title: 'Fresh', url: 'u', published_at: new Date(Date.now() - 3600000).toISOString() }] } };
  const r = await sendIssue({ ...env, DB }, iss);
  assert.equal(r.sent, 1); assert.equal(r.skipped_no_content, 1);
  const upd = runs.find((x) => /last_sent=json_set/.test(x.sql));
  assert.equal(upd.a[0], 'weekly'); assert.equal(upd.a[3], 1);
});
test('migration 0005 and subscribe form default to weekly', () => {
  const sql = fs.readFileSync(new URL('../migrations/0005_frequency_last_sent.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN last_sent /); assert.match(sql, /ADD COLUMN last_sent_at/);
  const html = fs.readFileSync(new URL('../../subscribe/index.html', import.meta.url), 'utf8');
  assert.match(html, /value="weekly" checked/); assert.doesNotMatch(html, /value="daily" checked/);
});
