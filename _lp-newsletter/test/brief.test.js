import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefSubscribe, briefConfirm, briefCors, signToken, verifyToken } from '../src/brief.js';

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
const readForm = async (req) => { const j = await req.json(); return { get: (k) => j[k], all: (k) => [].concat(j[k] ?? []) }; };
const env = { BRIEF_LIST_ID: '3', BREVO_API_KEY: 'k', ADMIN_TOKEN: 'x'.repeat(40), EMAIL_PROVIDER: 'brevo', FROM_EMAIL: 'editor@launchpaddigitalfl.com', FROM_NAME: 'Launchpad Digital',
  PUBLIC_URL: 'https://w.example', BRIEF_SITE_URL: 'https://condohoabrief.com', POSTAL_ADDRESS: '1 Main St' };
const mk = (body, origin = 'https://condohoabrief.com') => new Request('https://w.example/api/subscribe-brief', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', origin }, body: JSON.stringify(body) });
const deps = (over = {}) => ({ rateLimited: async () => false, refund: async () => {}, readForm, json, ...over });
const withFetch = async (fn, impl) => { const orig = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = orig; } };

test('valid signup emails a signed confirm link and does NOT add to the list yet', async () => {
  const calls = [];
  await withFetch(async () => {
    const r = await briefSubscribe(mk({ email: ' Reader@Example.com ', source: 'sticky-bar' }), env, deps());
    assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://condohoabrief.com');
  }, async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 201 }); });
  assert.equal(calls.length, 1); assert.match(calls[0].url, /smtp\/email$/);
  assert.equal(calls[0].body.to[0].email, 'reader@example.com'); assert.equal(calls[0].body.sender.name, 'Florida Condo & HOA Brief');
  const m = calls[0].body.textContent.match(/confirm\?t=([\w.-]+)/); assert.ok(m);
  const d = await verifyToken(env, m[1]); assert.equal(d.e, 'reader@example.com'); assert.equal(d.s, 'sticky-bar');
});
test('confirm link adds the contact to the Brief list, then redirects to the site', async () => {
  const tok = await signToken(env, { e: 'a@b.com', s: 'home', x: Math.floor(Date.now() / 1000) + 60 });
  let sent;
  const r = await withFetch(() => briefConfirm(env, new URL('https://w.example/brief/confirm?t=' + tok)), async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return new Response('{}', { status: 201 }); });
  assert.equal(r.status, 303); assert.match(r.headers.get('location'), /status=confirmed$/);
  assert.match(sent.url, /\/contacts$/); assert.deepEqual(sent.body.listIds, [3]); assert.equal(sent.body.email, 'a@b.com'); assert.equal(sent.body.emailBlacklisted, false);
});
test('tampered or expired confirm tokens are rejected and never reach Brevo', async () => {
  const good = await signToken(env, { e: 'a@b.com', s: 'x', x: Math.floor(Date.now() / 1000) + 60 });
  const expired = await signToken(env, { e: 'a@b.com', s: 'x', x: 1 });
  const [p, s] = good.split('.'); const forged = Buffer.from(JSON.stringify({ e: 'evil@b.com', s: 'x', x: 9999999999 })).toString('base64url') + '.' + s;
  let n = 0;
  for (const t of [expired, forged, p + '.AAAA', '', 'junk']) {
    const r = await withFetch(() => briefConfirm(env, new URL('https://w.example/brief/confirm?t=' + t)), async () => { n++; return new Response('{}'); });
    assert.match(r.headers.get('location'), /status=error$/);
  }
  assert.equal(n, 0);
});
test('bad email, honeypot, rate limit and missing config never send mail', async () => {
  let n = 0;
  await withFetch(async () => {
    assert.equal((await briefSubscribe(mk({ email: 'nope' }), env, deps())).status, 400);
    assert.equal((await briefSubscribe(mk({ email: 'a@b.com', website: 'x' }), env, deps())).status, 200);
    assert.equal((await briefSubscribe(mk({ email: 'a@b.com' }), env, deps({ rateLimited: async () => true }))).status, 429);
    assert.equal((await briefSubscribe(mk({ email: 'a@b.com' }), { ...env, BRIEF_LIST_ID: '' }, deps())).status, 503);
  }, async () => { n++; return new Response('{}', { status: 201 }); });
  assert.equal(n, 0);
});
test('email provider failure returns 502 and refunds both rate-limit counters', async () => {
  const refunded = [];
  await withFetch(async () => {
    const r = await briefSubscribe(mk({ email: 'a@b.com' }), env, deps({ refund: async (e, k) => refunded.push(k) }));
    assert.equal(r.status, 502);
  }, async () => new Response('{"code":"x"}', { status: 400 }));
  assert.deepEqual(refunded.sort(), ['brief:local', 'briefemail:a@b.com']);
});
test('CORS allows the Brief and Launchpad sites only', () => {
  const r = (o) => briefCors(new Request('https://w/x', { headers: { origin: o } }), {});
  assert.ok(r('https://condohoabrief.com')['access-control-allow-origin']);
  assert.ok(r('https://launchpaddigitalfl.com')['access-control-allow-origin']);
  assert.deepEqual(r('https://evil.example'), {});
});
