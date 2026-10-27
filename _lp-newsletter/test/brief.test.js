import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefSubscribe, briefCors } from '../src/brief.js';

const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
const readForm = async (req) => { const j = await req.json(); return { get: (k) => j[k], all: (k) => [].concat(j[k] ?? []) }; };
const env = { BRIEF_LIST_ID: '3', BRIEF_DOI_TEMPLATE_ID: '2', BREVO_API_KEY: 'k', BRIEF_SITE_URL: 'https://condohoabrief.com' };
const mk = (body, origin = 'https://condohoabrief.com') => new Request('https://w.example/api/subscribe-brief', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', origin }, body: JSON.stringify(body) });

test('valid signup calls Brevo DOI for the Brief list only', async () => {
  const calls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('{}', { status: 201 }); };
  try {
    const r = await briefSubscribe(mk({ email: ' Reader@Example.com ', source: 'sticky-bar' }), env, { rateLimited: async () => false, readForm, json });
    assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
    assert.equal(calls.length, 1); assert.match(calls[0].url, /doubleOptinConfirmation$/);
    assert.deepEqual(calls[0].body.includeListIds, [3]); assert.equal(calls[0].body.templateId, 2);
    assert.equal(calls[0].body.email, 'reader@example.com'); assert.equal(calls[0].body.attributes.SOURCE, 'signup: sticky-bar');
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://condohoabrief.com');
  } finally { globalThis.fetch = orig; }
});
test('bad email, honeypot, rate limit and missing config never reach Brevo', async () => {
  const orig = globalThis.fetch; let n = 0; globalThis.fetch = async () => { n++; return new Response('{}', { status: 201 }); };
  try {
    const d = { rateLimited: async () => false, readForm, json };
    assert.equal((await briefSubscribe(mk({ email: 'nope' }), env, d)).status, 400);
    assert.equal((await briefSubscribe(mk({ email: 'a@b.com', website: 'x' }), env, d)).status, 200);
    assert.equal((await briefSubscribe(mk({ email: 'a@b.com' }), env, { ...d, rateLimited: async () => true })).status, 429);
    assert.equal((await briefSubscribe(mk({ email: 'a@b.com' }), { ...env, BRIEF_LIST_ID: '' }, d)).status, 503);
    assert.equal(n, 0);
  } finally { globalThis.fetch = orig; }
});
test('Brevo failure returns 502', async () => {
  const orig = globalThis.fetch; globalThis.fetch = async () => new Response('{"code":"x"}', { status: 400 });
  try { assert.equal((await briefSubscribe(mk({ email: 'a@b.com' }), env, { rateLimited: async () => false, readForm, json })).status, 502); } finally { globalThis.fetch = orig; }
});
test('CORS allows the Brief and Launchpad sites only', () => {
  const r = (o) => briefCors(new Request('https://w/x', { headers: { origin: o } }), {});
  assert.ok(r('https://condohoabrief.com')['access-control-allow-origin']);
  assert.ok(r('https://launchpaddigitalfl.com')['access-control-allow-origin']);
  assert.deepEqual(r('https://evil.example'), {});
});
