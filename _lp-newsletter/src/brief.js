// Florida Condo & HOA Brief signups (condohoabrief.com). Separate from the Launchpad list: contacts live in a Brevo list
// (BRIEF_LIST_ID) and Brevo's double opt-in sends the confirmation email (BRIEF_DOI_TEMPLATE_ID). Nothing touches D1 subscribers.
const EMAIL_RE = /^[^\s@<>()]{1,64}@[^\s@<>()]{1,253}\.[a-z]{2,}$/i;
const DEFAULT_ORIGINS = 'https://condohoabrief.com,https://www.condohoabrief.com,https://launchpaddigitalfl.com,https://www.launchpaddigitalfl.com,http://localhost:8080';

export function briefCors(req, env) {
  const o = req.headers.get('origin') || '', allowed = (env.BRIEF_ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim());
  return allowed.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' } : {};
}

// deps: { rateLimited, readForm, json } from index.js
export async function briefSubscribe(req, env, deps) {
  const h = briefCors(req, env), wantsJson = (req.headers.get('accept') || '').includes('json');
  const site = env.BRIEF_SITE_URL || 'https://condohoabrief.com';
  const reply = (ok, msg, status = 200) => wantsJson ? deps.json({ ok, message: msg }, status, h)
    : Response.redirect(`${site}/subscribe/?status=${ok ? 'check-email' : 'error'}`, 303);
  if (!env.BRIEF_LIST_ID || !env.BRIEF_DOI_TEMPLATE_ID || !env.BREVO_API_KEY) return reply(false, 'Signup is not available right now.', 503);
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  if (await deps.rateLimited(env, 'brief:' + ip, 5, 600)) return reply(false, 'Too many attempts. Please try again in a few minutes.', 429);
  const f = await deps.readForm(req);
  if (f.get('website')) return reply(true, 'Check your email to confirm.'); // honeypot: pretend success
  const email = String(f.get('email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return reply(false, 'Please enter a valid email address.', 400);
  if (await deps.rateLimited(env, 'briefemail:' + email, 3, 3600)) return reply(false, 'Too many attempts for this address. Try again later.', 429);
  const source = String(f.get('source') || 'site').replace(/[^\w .:/@-]/g, '').slice(0, 60) || 'site';
  const r = await fetch('https://api.brevo.com/v3/contacts/doubleOptinConfirmation', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      email, includeListIds: [Number(env.BRIEF_LIST_ID)], templateId: Number(env.BRIEF_DOI_TEMPLATE_ID),
      redirectionUrl: `${site}/subscribe/?status=confirmed`,
      attributes: { SOURCE: 'signup: ' + source, SIGNUP_DATE: new Date().toISOString().slice(0, 10) },
    }),
  });
  if (!r.ok) { console.error('brevo doi', r.status, (await r.text()).slice(0, 300)); return reply(false, 'We could not send the confirmation email. Please try again later.', 502); }
  return reply(true, 'Almost done! Check your email and click the link to confirm.');
}
