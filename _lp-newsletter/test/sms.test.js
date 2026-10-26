import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeUsPhone, sendSms, parseInbound, buildSmsText, SMS_CONSENT_TEXT } from '../src/sms.js';
import { smsFromForm } from '../src/index.js';
import { FREQUENCIES, SMS_KINDS } from '../src/config.js';
import { sendIssue, WINDOW_DAYS } from '../src/sender.js';
import worker from '../src/index.js';

const F = (o) => ({ get: (k) => o[k], all: (k) => [].concat(o[k] ?? []) });

test('normalizeUsPhone accepts US formats, rejects junk', () => {
  for (const v of ['(321) 555-1234', '321-555-1234', '3215551234', '+1 321 555 1234', '1-321-555-1234']) assert.equal(normalizeUsPhone(v), '+13215551234', v);
  for (const v of ['', null, '555-1234', '+44 20 7946 0958', '0215551234', '3211551234', '1111111111', '321555123a', '9115551234', '3215550123', '12345678901234567890123456']) assert.equal(normalizeUsPhone(v), null, String(v));
});
test('smsFromForm: no phone = no SMS; needs valid phone, consent and a text type', () => {
  assert.deepEqual(smsFromForm(F({}), '1.2.3.4'), { cols: null });
  assert.match(smsFromForm(F({ phone: '123' , sms_consent: '1', sms_daily: '1' }), 'ip').error, /valid US mobile/);
  assert.match(smsFromForm(F({ phone: '3215551234', sms_daily: '1' }), 'ip').error, /check the box/);
  assert.match(smsFromForm(F({ phone: '3215551234', sms_consent: '1' }), 'ip').error, /Pick breaking/);
  const r = smsFromForm(F({ phone: '(321) 555-1234', sms_consent: '1', sms_breaking: '1' }), '1.2.3.4').cols;
  assert.equal(r[0], '+13215551234'); assert.equal(r[1], 1); assert.equal(r[2], 0);
  assert.match(r[3], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/); assert.equal(r[4], '1.2.3.4'); assert.match(r[5], /^sms-v1/); assert.equal(r[6], 'pending');
});
test('smsFromForm keeps original consent record when number unchanged', () => {
  const ex = { phone_e164: '+13215551234', sms_consent_at: '2026-10-01 00:00:00', sms_consent_ip: 'old', sms_consent_version: 'sms-v1-x', sms_status: 'active' };
  const r = smsFromForm(F({ phone: '3215551234', sms_consent: '1', sms_daily: '1' }), 'new', ex).cols;
  assert.deepEqual([r[3], r[4], r[5], r[6], r[2]], ['2026-10-01 00:00:00', 'old', 'sms-v1-x', 'active', 1]);
});
test('sendSms: log default, twilio/brevo stubbed (no network), bad number refused', async () => {
  globalThis.__smsOutbox = [];
  const realFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('network not allowed'); };
  try {
    for (const p of [undefined, 'twilio', 'brevo']) { const r = await sendSms({ to: '+13215551234', body: 'hi' }, { SMS_PROVIDER: p }); assert.ok(r.ok && r.stub, p); }
    assert.equal(globalThis.__smsOutbox.length, 3);
    assert.equal((await sendSms({ to: '555', body: 'x' }, {})).ok, false);
  } finally { globalThis.fetch = realFetch; }
});
test('parseInbound keywords', () => {
  assert.deepEqual(parseInbound(F({ From: '+13215551234', Body: ' stop ' })), { from: '+13215551234', type: 'stop' });
  assert.equal(parseInbound(F({ from: '3215551234', text: 'Help me' })).type, 'help');
  assert.equal(parseInbound(F({ From: '+13215551234', Body: 'unstop' })).type, 'start');
  assert.equal(parseInbound(F({ From: '+13215551234', Body: 'hello' })).type, 'other');
});
test('SMS text has links and STOP', () => {
  const t = buildSmsText('daily', [{ title: 'A', url: 'https://x/a' }, { title: 'B', url: 'https://x/b' }], { SITE_URL: 'https://s' });
  assert.match(t, /^Launchpad Daily: A https:\/\/x\/a \| B https:\/\/x\/b More: https:\/\/s\/news\/ Reply STOP/);
  assert.match(buildSmsText('breaking', [{ title: 'Z', url: 'u' }], {}), /BREAKING: Z u Reply STOP/);
});
test('email is weekly + monthly only; daily/breaking refused by sender', async () => {
  assert.deepEqual(Object.keys(FREQUENCIES), ['weekly', 'monthly']);
  assert.deepEqual(Object.keys(SMS_KINDS), ['breaking', 'daily']);
  assert.deepEqual(Object.keys(WINDOW_DAYS), ['weekly', 'monthly']);
  for (const f of ['daily', 'breaking']) assert.match((await sendIssue({}, { id: 'x', subject: 's', frequency: f })).error, /weekly or monthly/);
});
test('inbound webhook STOP marks the number stopped', async () => {
  const runs = [];
  const DB = { prepare: (sql) => ({ bind: (...a) => ({ run: async () => runs.push({ sql, a }) }) }) };
  const req = new Request('https://w/sms/inbound', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'From=%2B13215551234&Body=STOP' });
  const r = await (await worker.fetch(req, { DB })).json();
  assert.equal(r.type, 'stop'); assert.match(r.reply, /unsubscribed/);
  assert.ok(runs.some((x) => /sms_status='stopped'/.test(x.sql) && x.a[0] === '+13215551234'));
  const bad = await worker.fetch(new Request('https://w/sms/inbound?key=no', { method: 'POST', body: '' }), { DB, SMS_WEBHOOK_SECRET: 'yes' });
  assert.equal(bad.status, 401);
});
test('migration 0006 + subscribe form: no daily, phone optional, separate unchecked consent', () => {
  const sql = fs.readFileSync(new URL('../migrations/0006_sms_no_daily.sql', import.meta.url), 'utf8');
  for (const c of ['phone_e164', 'sms_breaking', 'sms_daily', 'sms_consent_at', 'sms_consent_ip', 'sms_consent_version', 'sms_status']) assert.match(sql, new RegExp(`ADD COLUMN ${c} `));
  assert.match(sql, /'daily' THEN 'weekly'/);
  const html = fs.readFileSync(new URL('../../subscribe/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /name="frequency" value="(daily|breaking)"/);
  assert.match(html, /value="weekly" checked/);
  assert.match(html, /<input id="lp-phone" type="tel" name="phone"(?![^>]*required)/);
  assert.match(html, /<input type="checkbox" name="sms_consent" value="1">/);
  assert.match(html, /name="sms_breaking"/); assert.match(html, /name="sms_daily"/);
  assert.ok(html.replace(/&amp;/g, '&').includes(SMS_CONSENT_TEXT));
});
