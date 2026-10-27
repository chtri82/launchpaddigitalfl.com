// Florida Condo & HOA Brief signups (condohoabrief.com). Separate from the Launchpad list: confirmed readers live in a Brevo
// list (BRIEF_LIST_ID). Double opt-in is done here (stateless HMAC-signed link, no DB table) because Brevo's own DOI endpoint
// needs a DOI template that can only be created in Brevo's web UI. The confirmation email goes out through the normal
// transactional provider; the contact is added to the Brevo list only when the reader clicks the link.
import { sendEmail } from './providers.js';

const EMAIL_RE = /^[^\s@<>()]{1,64}@[^\s@<>()]{1,253}\.[a-z]{2,}$/i;
const DEFAULT_ORIGINS = 'https://condohoabrief.com,https://www.condohoabrief.com,https://launchpaddigitalfl.com,https://www.launchpaddigitalfl.com,http://localhost:8080';
const TTL_SEC = 7 * 24 * 3600;
const enc = new TextEncoder();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const secret = (env) => env.BRIEF_CONFIRM_SECRET || env.ADMIN_TOKEN || '';

async function hmacKey(env) { return crypto.subtle.importKey('raw', enc.encode('brief-confirm:' + secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function signToken(env, data) {
  const p = b64u(enc.encode(JSON.stringify(data)));
  return p + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(p)));
}
export async function verifyToken(env, tok, now = Date.now() / 1000) {
  const [p, s] = String(tok || '').split('.');
  if (!p || !s || secret(env).length < 24) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(s), enc.encode(p)))) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return d && d.e && d.x > now ? d : null;
  } catch { return null; }
}

export function briefCors(req, env) {
  const o = req.headers.get('origin') || '', allowed = (env.BRIEF_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim());
  return allowed.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' } : {};
}

export function confirmMessage(env, to, tok) {
  const url = `${env.PUBLIC_URL}/brief/confirm?t=${tok}`;
  return {
    to, subject: 'Confirm your Florida Condo & HOA Brief subscription',
    from: { email: env.BRIEF_FROM_EMAIL || env.FROM_EMAIL, name: env.BRIEF_FROM_NAME || 'Florida Condo & HOA Brief' }, replyTo: env.BRIEF_REPLY_TO || env.REPLY_TO || env.FROM_EMAIL,
    html: `<div style="background:#F7F4EE;padding:16px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;font:16px/1.6 Arial,Helvetica,sans-serif;color:#121A26"><div style="background:#0B2540;color:#fff;padding:18px 28px;font:800 20px Georgia,serif">Florida Condo &amp; HOA Brief</div><div style="padding:28px"><p>Please confirm you want the free Florida Condo &amp; HOA Brief: plain-English Florida condo and HOA law, with a link to the source for every fact.</p><p><a href="${esc(url)}" style="background:#0B2540;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Confirm my subscription</a></p><p style="color:#566173;font-size:14px">If you didn't sign up, ignore this email and you won't hear from us again. Published by Launchpad Digital L.L.C., ${esc(env.POSTAL_ADDRESS)}</p></div></div></div>`,
    text: `Confirm your free Florida Condo & HOA Brief subscription:\n${url}\n\nIf you didn't sign up, ignore this email and you won't hear from us again.\nPublished by Launchpad Digital L.L.C., ${env.POSTAL_ADDRESS}\n`,
    headers: {},
  };
}

// deps: { rateLimited, refund, readForm, json } from index.js. Failed sends are refunded so retries aren't locked out.
export async function briefSubscribe(req, env, deps) {
  const h = briefCors(req, env), wantsJson = (req.headers.get('accept') || '').includes('json');
  const site = env.BRIEF_SITE_URL || 'https://condohoabrief.com';
  const reply = (ok, msg, status = 200) => wantsJson ? deps.json({ ok, message: msg }, status, h)
    : Response.redirect(`${site}/subscribe/?status=${ok ? 'check-email' : 'error'}`, 303);
  if (!env.BRIEF_LIST_ID || !env.BREVO_API_KEY || secret(env).length < 24) return reply(false, 'Signup is not available right now.', 503);
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const ipKey = 'brief:' + ip;
  if (await deps.rateLimited(env, ipKey, 10, 600)) return reply(false, 'Too many attempts. Please try again in a few minutes.', 429);
  const f = await deps.readForm(req);
  if (f.get('website')) return reply(true, 'Check your email to confirm.'); // honeypot: pretend success
  const email = String(f.get('email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(false, 'Please enter a valid email address.', 400);
  const emailKey = 'briefemail:' + email;
  if (await deps.rateLimited(env, emailKey, 5, 3600)) return reply(false, 'Too many attempts for this address. Try again later.', 429);
  const source = String(f.get('source') || 'site').replace(/[^\w .:/@-]/g, '').slice(0, 60) || 'site';
  const tok = await signToken(env, { e: email, s: source, x: Math.floor(Date.now() / 1000) + TTL_SEC });
  const r = await sendEmail(confirmMessage(env, email, tok), env);
  if (!r.ok) {
    console.error('brief confirm email failed', r.error);
    await deps.refund(env, ipKey); await deps.refund(env, emailKey);
    return reply(false, 'We could not send the confirmation email. Please try again later.', 502);
  }
  return reply(true, 'Almost done! Check your email and click the link to confirm.');
}

// GET /brief/confirm?t=...  Adds the contact to the Brevo list (explicit consent = the click), then redirects to the site.
export async function briefConfirm(env, url) {
  const site = env.BRIEF_SITE_URL || 'https://condohoabrief.com';
  const go = (s) => Response.redirect(`${site}/subscribe/?status=${s}`, 303);
  const d = await verifyToken(env, url.searchParams.get('t'));
  if (!d || !env.BRIEF_LIST_ID) return go('error');
  const r = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email: d.e, listIds: [Number(env.BRIEF_LIST_ID)], updateEnabled: true, emailBlacklisted: false,
      attributes: { SOURCE: 'signup: ' + (d.s || 'site'), SIGNUP_DATE: new Date().toISOString().slice(0, 10) } }),
  });
  if (!r.ok) { console.error('brevo add contact', r.status, (await r.text()).slice(0, 300)); return go('error'); }
  return go('confirmed');
}
