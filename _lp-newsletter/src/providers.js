// Pluggable email providers. Each: async send({to, subject, html, text, headers}, env) -> {ok, id?, error?}
export async function sendEmail(msg, env) {
  const p = (env.EMAIL_PROVIDER || 'log').toLowerCase();
  if (p === 'brevo') return brevo(msg, env);
  if (p === 'ses') return ses(msg, env);
  console.log('[log provider]', JSON.stringify({ to: msg.to, subject: msg.subject, headers: msg.headers, text: msg.text.slice(0, 2000) }));
  (globalThis.__outbox ||= []).push(msg);
  return { ok: true, id: 'log-' + Date.now() };
}

async function brevo(m, env) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: (m.from && m.from.email) || env.FROM_EMAIL, name: (m.from && m.from.name) || env.FROM_NAME }, replyTo: { email: m.replyTo || env.REPLY_TO || env.FROM_EMAIL },
      to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text, ...(m.headers && Object.keys(m.headers).length ? { headers: m.headers } : {}),
    }),
  });
  const body = await r.text();
  return r.ok ? { ok: true, id: body } : { ok: false, error: `brevo ${r.status}: ${body.slice(0, 300)}` };
}

// Amazon SES v2 SendEmail with AWS SigV4 signed in WebCrypto.
async function ses(m, env) {
  const region = env.AWS_REGION || 'us-east-1', host = `email.${region}.amazonaws.com`, path = '/v2/email/outbound-emails';
  const payload = JSON.stringify({
    FromEmailAddress: `${env.FROM_NAME} <${env.FROM_EMAIL}>`, ReplyToAddresses: [env.REPLY_TO || env.FROM_EMAIL],
    Destination: { ToAddresses: [m.to] },
    Content: { Simple: {
      Subject: { Data: m.subject, Charset: 'UTF-8' },
      Body: { Html: { Data: m.html, Charset: 'UTF-8' }, Text: { Data: m.text, Charset: 'UTF-8' } },
      Headers: Object.entries(m.headers || {}).map(([Name, Value]) => ({ Name, Value })),
    } },
  });
  const now = new Date(), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = amzDate.slice(0, 8);
  const enc = new TextEncoder();
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  const hmac = async (k, s) => crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', typeof k === 'string' ? enc.encode(k) : k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(s));
  const ph = await sha(payload);
  const canon = ['POST', path, '', `content-type:application/json`, `host:${host}`, `x-amz-date:${amzDate}`, '', 'content-type;host;x-amz-date', ph].join('\n');
  const scope = `${day}/${region}/ses/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amzDate, scope, await sha(canon)].join('\n');
  let k = await hmac('AWS4' + env.AWS_SECRET_ACCESS_KEY, day);
  k = await hmac(k, region); k = await hmac(k, 'ses'); k = await hmac(k, 'aws4_request');
  const sig = hex(await hmac(k, sts));
  const r = await fetch(`https://${host}${path}`, { method: 'POST', body: payload, headers: {
    'content-type': 'application/json', 'x-amz-date': amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${sig}`,
  } });
  const body = await r.text();
  return r.ok ? { ok: true, id: body } : { ok: false, error: `ses ${r.status}: ${body.slice(0, 300)}` };
}
