// Provider-agnostic SMS. SMS_PROVIDER: "log" (default) | "twilio" | "brevo". Real sending is stubbed until a
// provider is chosen and approved: twilio/brevo only build the request and log it unless SMS_LIVE === "1".
export const SMS_CONSENT_VERSION = 'sms-v1-2026-10-25';
export const SMS_CONSENT_TEXT = 'Yes, send me Launchpad Digital text messages (breaking news and/or a daily news text with links) at the number above. Msg frequency varies, up to about 3/day. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent is not a condition of signing up.';
export const SMS_HELP_TEXT = 'Launchpad Digital news texts. Msg frequency varies, up to ~3/day. Msg & data rates may apply. Help: editor@launchpaddigitalfl.com. Reply STOP to cancel.';
export const SMS_STOP_TEXT = 'Launchpad Digital: You are unsubscribed and will get no more texts. Reply START to resubscribe.';
export const SMS_START_TEXT = 'Launchpad Digital: You are resubscribed to news texts. Msg & data rates may apply. Reply HELP for help, STOP to cancel.';
export const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
export const HELP_WORDS = ['HELP', 'INFO'];
export const START_WORDS = ['START', 'UNSTOP', 'YES'];

// US mobile/landline numbers only (NANP): returns +1XXXXXXXXXX or null.
export function normalizeUsPhone(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw || raw.length > 25 || /[^\d\s().+\-]/.test(raw)) return null;
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;           // area code + exchange can't start with 0/1
  if (/^(\d)\1{9}$/.test(d) || d.slice(3, 6) === '555' && /^01\d\d$/.test(d.slice(6))) return null; // junk / fictional 555-01xx
  if (/^[2-9]11/.test(d)) return null;                          // N11 service codes
  return '+1' + d;
}

export async function sendSms(msg, env) {
  const p = (env.SMS_PROVIDER || 'log').toLowerCase();
  const m = { to: msg.to, body: String(msg.body || '').slice(0, 640) };
  if (!/^\+1\d{10}$/.test(m.to || '')) return { ok: false, error: 'invalid destination' };
  if (p === 'twilio') return twilio(m, env);
  if (p === 'brevo') return brevoSms(m, env);
  return logOnly('log', m);
}
function logOnly(provider, m, req) {
  console.log('[sms ' + provider + ']', JSON.stringify({ to: m.to, body: m.body, request: req ? { url: req.url } : undefined }));
  (globalThis.__smsOutbox ||= []).push({ provider, ...m });
  return { ok: true, id: `${provider}-log-${Date.now()}`, stub: true };
}
// Twilio Messages API (stub). Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID.
async function twilio(m, env) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID || 'AC_NOT_SET'}/Messages.json`;
  if (env.SMS_LIVE !== '1') return logOnly('twilio', m, { url });
  return { ok: false, error: 'twilio live sending not implemented yet' };
}
// Brevo transactional SMS (stub). Needs BREVO_API_KEY with SMS credits, SMS_SENDER.
async function brevoSms(m, env) {
  const url = 'https://api.brevo.com/v3/transactionalSMS/sms';
  if (env.SMS_LIVE !== '1') return logOnly('brevo', m, { url });
  return { ok: false, error: 'brevo live sending not implemented yet' };
}

// Daily / breaking text body: short headline list + links (articles, newsletter, site sections).
export function buildSmsText(kind, items, env) {
  const site = env.SITE_URL || 'https://launchpaddigitalfl.com';
  const head = kind === 'breaking' ? 'Launchpad BREAKING:' : 'Launchpad Daily:';
  const lines = (items || []).slice(0, kind === 'breaking' ? 1 : 3).map((s) => `${s.title} ${s.url}`);
  return `${head} ${lines.join(' | ')}${kind === 'daily' ? ` More: ${site}/news/` : ''} Reply STOP to cancel`;
}

// Parse inbound keyword from a provider webhook body (Twilio: Body/From; Brevo/others: text/from or message/number).
export function parseInbound(f) {
  const from = f.get('From') || f.get('from') || f.get('number') || f.get('msisdn') || '';
  const body = String(f.get('Body') || f.get('text') || f.get('message') || '').trim().toUpperCase();
  const kw = body.split(/\s+/)[0] || '';
  const type = STOP_WORDS.includes(kw) ? 'stop' : HELP_WORDS.includes(kw) ? 'help' : START_WORDS.includes(kw) ? 'start' : 'other';
  return { from: normalizeUsPhone(from), type };
}
