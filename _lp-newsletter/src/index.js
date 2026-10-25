import { SECTIONS, FREQUENCIES } from './config.js';
import { sendEmail } from './providers.js';
import { sendIssue, scheduledRun } from './sender.js';
import { countiesForZip, placesIn, resolveLocations, subLocations, COUNTIES, GEO } from './counties.js';

const COUNTY_NOTE = 'Optional. We use your ZIP codes or counties only to pick the 3 Top Local Stories at the top of each issue; every other local story is still listed under Around Florida. Skip it and you get statewide stories there. We never sell your data.';
// Server-rendered location editor for /preferences: one block per saved location, plus "add another" (ZIP or county list).
function locationFields(s) {
  const locs = subLocations(s);
  let h = `<fieldset id="county"><legend>Local news areas (optional)</legend><small>${COUNTY_NOTE}</small>`;
  locs.forEach((l, i) => {
    const opts = l.zip ? countiesForZip(l.zip) : [];
    const types = Object.fromEntries((GEO.places[l.county] || []).map((p) => [p.name, p.incorporated]));
    h += `<fieldset class="loc" data-loc="${i}"><legend>${esc(l.county)} County${l.zip ? ` (ZIP ${esc(l.zip)})` : ''}</legend><input type="hidden" name="loc${i}_zip" value="${esc(l.zip || '')}"><input type="hidden" name="loc${i}_prev" value="${esc(l.county)}">`;
    if (opts.length > 1) h += `<label>ZIP ${esc(l.zip)} is in more than one county. Which one? <select name="loc${i}_county">${opts.map((c) => `<option${c === l.county ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
    else h += `<input type="hidden" name="loc${i}_county" value="${esc(l.county)}">`;
    h += `<label><input type="checkbox" name="loc${i}_cities" value="all"${l.cities.length ? '' : ' checked'}> All of ${esc(l.county)} County</label><p>Or only these cities and towns:</p>`;
    h += placesIn(l.county).map((n) => `<label><input type="checkbox" name="loc${i}_cities" value="${esc(n)}"${l.cities.includes(n) ? ' checked' : ''}> ${esc(n)}${types[n] ? '' : ' (unincorporated)'}</label>`).join('');
    h += `<label><input type="checkbox" name="loc${i}_remove" value="1"> Remove this location</label></fieldset>`;
  });
  h += `<input type="hidden" name="loc_count" value="${locs.length}"><fieldset><legend>${locs.length ? 'Add another location' : 'Add a location'}</legend>`;
  h += `<label>ZIP code <input name="add_zip" inputmode="numeric" pattern="\\d{5}" maxlength="5"></label>`;
  h += `<label>or pick a county <select name="add_county"><option value="">(choose a county)</option>${COUNTIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>`;
  h += '<small>Save to add it, then pick "All of" the county or specific cities.</small></fieldset>';
  return h + '</fieldset>';
}
// Locations from a submitted form: JSON "locations" (signup page JS), indexed loc{i}_* blocks (preferences),
// add_zip/add_county (preferences "add another"), and legacy single zip/county/cities. All validated by resolveLocations.
function formLocations(f) {
  const list = [];
  const j = f.get('locations');
  if (j) { try { const v = typeof j === 'string' ? JSON.parse(j) : j; if (Array.isArray(v)) list.push(...v); } catch { /* ignore */ } }
  const n = Math.min(Number(f.get('loc_count')) || 0, 100);
  for (let i = 0; i < n; i++) {
    if (f.get(`loc${i}_remove`)) continue;
    const county = f.get(`loc${i}_county`), prev = f.get(`loc${i}_prev`);
    list.push({ zip: f.get(`loc${i}_zip`), county, cities: county && prev && String(county) !== String(prev) ? ['all'] : f.all(`loc${i}_cities`) });
  }
  if (f.get('zip')) list.push({ zip: f.get('zip'), county: f.get('county'), cities: f.all('cities') });
  if (f.get('add_zip')) list.push({ zip: f.get('add_zip'), cities: ['all'] });
  if (f.get('add_county')) list.push({ county: f.get('add_county'), cities: ['all'] });
  return resolveLocations(list);
}
// DB columns: locations (JSON list) + legacy zip/county/cities mirroring the first location.
const locCols = (locs) => [JSON.stringify(locs), locs[0]?.zip ?? null, locs[0]?.county ?? null, locs[0] ? JSON.stringify(locs[0].cities) : null];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL_RE = /^[^\s@<>()]{1,64}@[^\s@<>()]{1,253}\.[a-z]{2,}$/i;
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

function cors(req, env) {
  const o = req.headers.get('origin') || '', allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return allowed.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' } : {};
}
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });

export function page(env, title, body) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Launchpad Digital</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f7fb;color:#00102A;margin:0}main{max-width:640px;margin:3rem auto;background:#fff;padding:2rem;border-radius:14px;box-shadow:0 4px 20px #0001}h1{margin-top:0}a{color:#0b5cff}.btn{background:#00102A;color:#fff;border:0;padding:.7rem 1.2rem;border-radius:8px;font-size:1rem;cursor:pointer}label{display:block;margin:.3rem 0}fieldset{border:1px solid #dde;border-radius:8px;margin:1rem 0}</style></head>
<body><main><p><a href="${esc(env.SITE_URL)}">← Launchpad Digital</a></p><h1>${esc(title)}</h1>${body}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
}

async function rateLimited(env, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key=?').bind(key).first();
  if (!row || now - row.window_start >= windowSec) {
    await env.DB.prepare('INSERT INTO rate_limits(key,count,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start').bind(key, now).run();
    return false;
  }
  if (row.count >= limit) return true;
  await env.DB.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').bind(key).run();
  return false;
}

async function readForm(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) { const j = await req.json(); return { get: (k) => j[k], all: (k) => [].concat(j[k] ?? []) }; }
  const f = await req.formData(); return { get: (k) => f.get(k), all: (k) => f.getAll(k) };
}
const pick = (vals, allowed) => [...new Set(vals.map(String).filter((v) => v in allowed))];

async function subscribe(req, env) {
  const h = cors(req, env), wantsJson = (req.headers.get('accept') || '').includes('json');
  const reply = (ok, msg, status = 200) => wantsJson ? json({ ok, message: msg }, status, h)
    : Response.redirect(`${env.SITE_URL}/subscribe/?status=${ok ? 'check-email' : 'error'}#launchpad`, 303);
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  if (await rateLimited(env, 'sub:' + ip, 5, 600)) return reply(false, 'Too many attempts. Please try again in a few minutes.', 429);
  const f = await readForm(req);
  if (f.get('website')) return reply(true, 'Check your email to confirm.'); // honeypot: pretend success
  const email = String(f.get('email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(false, 'Please enter a valid email address.', 400);
  if (await rateLimited(env, 'email:' + email, 3, 3600)) return reply(false, 'Too many attempts for this address. Try again later.', 429);
  const name = String(f.get('name') || '').trim().slice(0, 100) || null;
  const locs = formLocations(f);
  let sections = pick(f.all('sections'), SECTIONS), freqs = pick(f.all('frequency'), FREQUENCIES);
  if (!sections.length) sections = Object.keys(SECTIONS);
  if (!freqs.length) freqs = ['daily'];
  const existing = await env.DB.prepare('SELECT * FROM subscribers WHERE email=?').bind(email).first();
  let tok;
  if (existing && existing.status === 'active') {
    // Don't let a stranger change someone's prefs: email them a manage link instead.
    await sendEmail(manageEmail(env, email, existing.token), env);
    return reply(true, 'Check your email to confirm.');
  }
  tok = token();
  if (existing) {
    await env.DB.prepare("UPDATE subscribers SET name=?, locations=?, zip=?, county=?, cities=?, sections=?, frequencies=?, status='pending', token=?, consent_ip=?, updated_at=datetime('now') WHERE id=?")
      .bind(name, ...locCols(locs), JSON.stringify(sections), JSON.stringify(freqs), tok, ip, existing.id).run();
  } else {
    await env.DB.prepare('INSERT INTO subscribers(email,name,locations,zip,county,cities,sections,frequencies,token,source,consent_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .bind(email, name, ...locCols(locs), JSON.stringify(sections), JSON.stringify(freqs), tok, String(f.get('source') || 'site').slice(0, 50), ip).run();
  }
  const r = await sendEmail(confirmEmail(env, email, name, tok), env);
  if (!r.ok) { console.error(r.error); return reply(false, 'We could not send the confirmation email. Please try again later.', 502); }
  return reply(true, 'Almost done! Check your email and click the link to confirm.');
}

function footer(env, tok) {
  return { html: `<hr><p style="font-size:12px;color:#666">Launchpad Digital L.L.C. · ${esc(env.POSTAL_ADDRESS)}<br><a href="${env.PUBLIC_URL}/preferences?token=${tok}">Manage preferences</a> · <a href="${env.PUBLIC_URL}/unsubscribe?token=${tok}">Unsubscribe</a></p>`,
    text: `\n--\nLaunchpad Digital L.L.C. · ${env.POSTAL_ADDRESS}\nManage preferences: ${env.PUBLIC_URL}/preferences?token=${tok}\nUnsubscribe: ${env.PUBLIC_URL}/unsubscribe?token=${tok}\n` };
}
function confirmEmail(env, to, name, tok) {
  const url = `${env.PUBLIC_URL}/confirm?token=${tok}`, f = footer(env, tok);
  return { to, subject: 'Confirm your Launchpad Digital subscription',
    html: `<p>Hi${name ? ' ' + esc(name) : ''},</p><p>Please confirm you want the free Launchpad Digital newsletter:</p><p><a href="${url}" style="background:#00102A;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Confirm subscription</a></p><p>If you didn't sign up, ignore this email and you won't hear from us.</p>${f.html}`,
    text: `Confirm your free Launchpad Digital subscription:\n${url}\n\nIf you didn't sign up, ignore this email.${f.text}`, headers: {} };
}
function manageEmail(env, to, tok) {
  const f = footer(env, tok);
  return { to, subject: 'Your Launchpad Digital subscription', html: `<p>You're already subscribed. Use the link below to change your sections or how often you hear from us.</p>${f.html}`, text: `You're already subscribed.${f.text}`, headers: {} };
}

async function byToken(env, url) {
  const t = url.searchParams.get('token') || '';
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  return env.DB.prepare('SELECT * FROM subscribers WHERE token=?').bind(t).first();
}

async function confirm(req, env, url) {
  const s = await byToken(env, url);
  if (!s) return page(env, 'Link not valid', '<p>This confirmation link is invalid or expired. Please sign up again.</p>');
  if (s.status !== 'active') await env.DB.prepare("UPDATE subscribers SET status='active', confirmed_at=datetime('now'), unsubscribed_at=NULL, updated_at=datetime('now') WHERE id=?").bind(s.id).run();
  return page(env, "You're subscribed", `<p>Thanks${s.name ? ', ' + esc(s.name) : ''}! Your subscription to Launchpad Digital is confirmed.</p><p><a href="${env.PUBLIC_URL}/preferences?token=${s.token}">Choose your sections and frequency</a></p>`);
}

async function unsubscribe(req, env, url) {
  const s = await byToken(env, url);
  if (!s) return page(env, 'Link not valid', '<p>This unsubscribe link is invalid. Reply to any issue and we will remove you by hand.</p>');
  if (req.method === 'POST') { // RFC 8058 one-click (List-Unsubscribe-Post) or button below
    await env.DB.prepare("UPDATE subscribers SET status='unsubscribed', unsubscribed_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(s.id).run();
    if ((req.headers.get('content-type') || '').includes('form') && !(req.headers.get('accept') || '').includes('html')) return new Response('Unsubscribed', { status: 200 });
    return page(env, "You're unsubscribed", `<p>${esc(s.email)} won't receive Launchpad Digital emails anymore.</p><p>Changed your mind? <a href="${env.SITE_URL}/subscribe/#launchpad">Subscribe again</a>.</p>`);
  }
  // GET shows a button so link scanners don't unsubscribe people by prefetching.
  return page(env, 'Unsubscribe', `<p>Unsubscribe <strong>${esc(s.email)}</strong> from all Launchpad Digital emails?</p><form method="post"><button class="btn" type="submit">Unsubscribe</button></form><p>Or <a href="${env.PUBLIC_URL}/preferences?token=${s.token}">change what you get</a> instead.</p>`);
}

async function preferences(req, env, url) {
  const s = await byToken(env, url);
  if (!s) return page(env, 'Link not valid', '<p>This link is invalid.</p>');
  let note = '';
  if (req.method === 'POST') {
    const f = await req.formData();
    const sec = pick(f.getAll('sections'), SECTIONS), fr = pick(f.getAll('frequency'), FREQUENCIES);
    const name = String(f.get('name') || '').trim().slice(0, 100) || null;
    const locs = formLocations({ get: (k) => f.get(k), all: (k) => f.getAll(k) });
    await env.DB.prepare("UPDATE subscribers SET name=?, locations=?, zip=?, county=?, cities=?, sections=?, frequencies=?, status=CASE WHEN status='unsubscribed' THEN 'active' ELSE status END, updated_at=datetime('now') WHERE id=?")
      .bind(name, ...locCols(locs), JSON.stringify(sec.length ? sec : Object.keys(SECTIONS)), JSON.stringify(fr.length ? fr : ['daily']), s.id).run();
    Object.assign(s, await env.DB.prepare('SELECT * FROM subscribers WHERE id=?').bind(s.id).first());
    note = '<p style="background:#e7f7ec;padding:.6rem;border-radius:6px">Saved.</p>';
  }
  const sec = JSON.parse(s.sections), fr = JSON.parse(s.frequencies);
  const boxes = (obj, name, chosen) => Object.entries(obj).map(([k, v]) => `<label><input type="checkbox" name="${name}" value="${k}"${chosen.includes(k) ? ' checked' : ''}> ${esc(v)}</label>`).join('');
  return page(env, 'Your preferences', `${note}<p>${esc(s.email)} · status: <strong>${esc(s.status)}</strong> · plan: ${esc(s.tier)}</p>
<form method="post"><label>Name (optional) <input name="name" value="${esc(s.name || '')}"></label>
${locationFields(s)}
<fieldset><legend>How often</legend>${boxes(FREQUENCIES, 'frequency', fr)}</fieldset>
<fieldset><legend>Sections</legend>${boxes(SECTIONS, 'sections', sec)}</fieldset>
<button class="btn" type="submit">Save preferences</button></form>
<p><a href="${env.PUBLIC_URL}/unsubscribe?token=${s.token}">Unsubscribe from everything</a></p>`);
}

function authed(req, env) {
  const a = req.headers.get('authorization') || '';
  return env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 24 && a === `Bearer ${env.ADMIN_TOKEN}`;
}
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function exportCsv(req, env) {
  if (!authed(req, env)) return new Response('Unauthorized', { status: 401 });
  const { results } = await env.DB.prepare('SELECT id,email,name,locations,zip,county,cities,sections,frequencies,status,tier,source,created_at,confirmed_at,unsubscribed_at,consent_ip FROM subscribers ORDER BY id').all();
  const cols = ['id', 'email', 'name', 'locations', 'zip', 'county', 'cities', 'sections', 'frequencies', 'status', 'tier', 'source', 'created_at', 'confirmed_at', 'unsubscribed_at', 'consent_ip'];
  const body = [cols.join(','), ...results.map((r) => cols.map((c) => csvCell(c === 'sections' || c === 'frequencies' ? JSON.parse(r[c]).join(';') : c === 'locations' ? subLocations(r).map((l) => `${l.county}${l.cities.length ? ':' + l.cities.join('|') : ''}`).join(';') : r[c])).join(','))].join('\n') + '\n';
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="launchpad-subscribers-${new Date().toISOString().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}

// Stripe hook (paid tiers later): verify signature, then on checkout.session.completed set tier='paid'.
async function stripeWebhook(req, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Stripe not configured yet' }, 501);
  // TODO when going paid: verify Stripe-Signature (HMAC-SHA256 of `${t}.${body}`), then
  // UPDATE subscribers SET tier='paid', stripe_customer_id=? WHERE email=?
  return json({ error: 'not implemented' }, 501);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    try {
      if (p === '/api/subscribe' && req.method === 'POST') return await subscribe(req, env);
      if (p === '/confirm') return await confirm(req, env, url);
      if (p === '/unsubscribe') return await unsubscribe(req, env, url);
      if (p === '/preferences') return await preferences(req, env, url);
      if (p === '/admin/export.csv') return await exportCsv(req, env);
      if (p === '/admin/send' && req.method === 'POST') {
        if (!authed(req, env)) return new Response('Unauthorized', { status: 401 });
        return json(await sendIssue(env, await req.json()));
      }
      if (p === '/stripe/webhook' && req.method === 'POST') return await stripeWebhook(req, env);
      if (p === '/health') return json({ ok: true });
      return new Response('Not found', { status: 404 });
    } catch (e) { console.error(e.stack || e); return json({ ok: false, message: 'Server error' }, 500, cors(req, env)); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(scheduledRun(env, new Date(event.scheduledTime))); },
};
