import { SECTIONS } from './config.js';
import { sendEmail } from './providers.js';
import { topLocal, TOP_LOCAL } from './counties.js';

// Format: 3 TOP LOCAL STORIES per subscriber, then each section with 2-5 stories.
export const SECTION_MIN = 2, SECTION_MAX = 5;
// Build-time check: trims sections to 5, drops empty ones, warns (never fails) when a section has fewer than 2.
export function checkSections(issue) {
  const warnings = [], sections = {};
  for (const [k, arr] of Object.entries(issue.sections || {})) {
    if (k === 'local') { sections[k] = arr || []; if ((arr || []).length < TOP_LOCAL) warnings.push(`local: ${(arr || []).length} stories in pool, top block needs ${TOP_LOCAL}`); continue; }
    const n = (arr || []).length;
    if (!n) { warnings.push(`${k}: 0 stories, section omitted`); continue; }
    if (n < SECTION_MIN) warnings.push(`${k}: ${n} story, below minimum ${SECTION_MIN}`);
    if (n > SECTION_MAX) warnings.push(`${k}: ${n} stories, trimmed to ${SECTION_MAX}`);
    sections[k] = arr.slice(0, SECTION_MAX);
  }
  return { issue: { ...issue, sections }, warnings };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Issue JSON:
 { "id": "2026-10-26-daily", "frequency": "daily|weekly|monthly|breaking", "subject": "...", "intro": "...",
   "tier": "free|paid" (optional; paid = only paid subscribers — Stripe hook),
   "sections": { "local": [{ "title": "...", "url": "https://...", "source": "...", "summary": "...",
                "counties": ["Brevard"] | ["region:Central"] | ["statewide"] }], ... },
   "local" is the pool for the 3 TOP LOCAL STORIES block (always first), picked per subscriber: cities, county, rest of county, region, statewide, rest.
   Every other section: 2-5 stories (checkSections warns under 2, trims over 5, omits empty).
   "dryRun": false, "limit": 300 } */
const localLabel = (s) => { const c = s.cities ? JSON.parse(s.cities) : []; return c.length ? `${c.join(', ')} (${s.county} County)` : `all of ${s.county} County`; };
export function buildIssue(env, issueIn, sub) {
  const issue = checkSections(issueIn).issue;
  const chosen = JSON.parse(sub.sections);
  const keys = Object.keys(SECTIONS).filter((k) => chosen.includes(k) && issue.sections?.[k]?.length);
  if (!keys.length) return null;
  const pref = `${env.PUBLIC_URL}/preferences?token=${sub.token}`, unsub = `${env.PUBLIC_URL}/unsubscribe?token=${sub.token}`;
  let html = `<div style="font-family:Georgia,serif;max-width:640px;margin:auto;color:#00102A"><h1 style="font-family:system-ui">${esc(issue.subject)}</h1>${issue.intro ? `<p>${esc(issue.intro)}</p>` : ''}`;
  let text = `${issue.subject}\n\n${issue.intro ? issue.intro + '\n\n' : ''}`;
  const item = (s) => {
    html += `<p>${s.group ? `<span style="font-family:system-ui;font-size:11px;text-transform:uppercase;color:#666">${esc(s.group)}</span><br>` : ''}<a href="${esc(s.url)}"><strong>${esc(s.title)}</strong></a>${s.source ? ` <em>(${esc(s.source)})</em>` : ''}<br>${esc(s.summary || '')}</p>`;
    text += `- ${s.group ? `[${s.group}] ` : ''}${s.title}${s.source ? ` (${s.source})` : ''}\n  ${s.url}\n${s.summary ? '  ' + s.summary + '\n' : ''}`;
  };
  for (const k of keys) {
    const title = k === 'local' ? 'Top Local Stories' : SECTIONS[k];
    html += `<h2 style="font-family:system-ui;border-bottom:2px solid #00102A">${esc(title)}</h2>`;
    text += `== ${title} ==\n`;
    const items = k === 'local' ? topLocal(issue.sections.local, { county: sub.county, cities: sub.cities }) : issue.sections[k];
    items.forEach(item);
    text += '\n';
  }
  html += `<hr><p style="font-size:12px;color:#666">You're getting this because you subscribed at launchpaddigitalfl.com.<br>Launchpad Digital L.L.C. · ${esc(env.POSTAL_ADDRESS)}<br>Sponsorship and advertising: <a href="mailto:advertise@launchpaddigitalfl.com">advertise@launchpaddigitalfl.com</a><br><a href="${pref}">Manage preferences</a> · <a href="${pref}#county">${sub.county ? `Local news set to ${esc(localLabel(sub))}. Change` : 'Add your ZIP for local news'}</a> · <a href="${unsub}">Unsubscribe</a></p></div>`;
  text += `--\nLaunchpad Digital L.L.C. · ${env.POSTAL_ADDRESS}\nAdvertising: advertise@launchpaddigitalfl.com\nManage preferences: ${pref}\n${sub.county ? `Local news set to ${localLabel(sub)}. Change` : 'Add your ZIP for local news'}: ${pref}#county\nUnsubscribe: ${unsub}\n`;
  return { to: sub.email, subject: issue.subject, html, text,
    headers: { 'List-Unsubscribe': `<${unsub}>, <mailto:${env.REPLY_TO || env.FROM_EMAIL}?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

export async function sendIssue(env, issue) {
  if (!issue?.id || !issue?.subject || !issue?.frequency) return { ok: false, error: 'id, subject, frequency required' };
  if (!issue.dryRun && /REQUIRED/.test(env.POSTAL_ADDRESS || '') && env.EMAIL_PROVIDER !== 'log') return { ok: false, error: 'Set POSTAL_ADDRESS (CAN-SPAM) before real sends' };
  const cap = Math.min(Number(issue.limit) || Infinity, Number(env.DAILY_SEND_CAP) || Infinity);
  const sentToday = (await env.DB.prepare("SELECT COUNT(*) n FROM sends WHERE status='sent' AND sent_at >= date('now')").first()).n;
  let budget = cap - sentToday;
  const tierSql = issue.tier === 'paid' ? "AND tier='paid'" : '';
  const { results } = await env.DB.prepare(`SELECT s.* FROM subscribers s WHERE status='active' ${tierSql} AND EXISTS (SELECT 1 FROM json_each(s.frequencies) WHERE value=?) AND NOT EXISTS (SELECT 1 FROM sends x WHERE x.issue_id=? AND x.subscriber_id=s.id AND x.status='sent') ORDER BY county, id`).bind(issue.frequency, issue.id).all();
  const out = { ok: true, matched: results.length, sent: 0, skipped_no_content: 0, failed: 0, deferred_by_cap: 0, previews: [] };
  for (const sub of results) {
    const msg = buildIssue(env, issue, sub);
    if (!msg) { out.skipped_no_content++; continue; }
    if (issue.dryRun) { if (out.previews.length < 3) out.previews.push({ to: msg.to, headers: msg.headers, text: msg.text }); continue; }
    if (budget <= 0) { out.deferred_by_cap++; continue; }
    const r = await sendEmail(msg, env);
    budget--;
    await env.DB.prepare('INSERT INTO sends(issue_id,subscriber_id,provider,status,error) VALUES(?,?,?,?,?) ON CONFLICT(issue_id,subscriber_id) DO UPDATE SET status=excluded.status, error=excluded.error, sent_at=datetime(\'now\')')
      .bind(issue.id, sub.id, env.EMAIL_PROVIDER || 'log', r.ok ? 'sent' : 'failed', r.ok ? null : r.error).run();
    r.ok ? out.sent++ : out.failed++;
  }
  return out;
}

// Cron: daily always; weekly on Mondays; monthly on the 1st. Needs ISSUE_FEED_URL returning
// { "daily": {issue...}, "weekly": {...}, "monthly": {...} } — only approved stories should be in it.
export async function scheduledRun(env, when) {
  if (!env.ISSUE_FEED_URL) { console.log('cron: ISSUE_FEED_URL not set, nothing to send'); return; }
  const feed = await (await fetch(env.ISSUE_FEED_URL)).json();
  const freqs = ['daily']; if (when.getUTCDay() === 1) freqs.push('weekly'); if (when.getUTCDate() === 1) freqs.push('monthly');
  for (const f of freqs) if (feed[f]) console.log('cron', f, JSON.stringify(await sendIssue(env, { ...feed[f], frequency: f })));
}
