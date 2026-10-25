# Launchpad Digital newsletter (self-owned)

Cloudflare Worker + D1. Subscriber data lives in our own D1 database; export any time as CSV.

- `src/index.js` – endpoints: `POST /api/subscribe`, `GET /confirm`, `GET|POST /unsubscribe` (RFC 8058 one-click), `GET|POST /preferences`, `GET /admin/export.csv` (Bearer ADMIN_TOKEN), `POST /admin/send` (Bearer), `POST /stripe/webhook` (stub), `GET /health`
- `src/sender.js` – builds per-subscriber issues (only their sections), List-Unsubscribe headers, CAN-SPAM footer, daily cap, de-dupe per issue; cron (`0 11 * * *`) reads `ISSUE_FEED_URL`
- `src/providers.js` – `EMAIL_PROVIDER` = `log` | `brevo` | `ses`
- `migrations/0001_init.sql` – schema (includes `tier` / `stripe_customer_id` for paid plans later)
- `scripts/test-local.sh` – end-to-end test against `npx wrangler dev`

Local: `npm i && npx wrangler d1 migrations apply lp-newsletter --local && npx wrangler dev --var PUBLIC_URL:http://localhost:8787 --var SITE_URL:http://localhost:8080`, then `scripts/test-local.sh`. Requires Node 20 + wrangler 4.20 (newer wrangler needs Node 22).

Send an issue: `curl -X POST -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' $URL/admin/send -d @issue.json` (add `"dryRun":true` to preview).

Go live: `wrangler login`; `wrangler d1 create lp-newsletter` (paste id into wrangler.toml); `wrangler d1 migrations apply lp-newsletter --remote`; `wrangler secret put ADMIN_TOKEN` (+ BREVO_API_KEY or AWS_*); set POSTAL_ADDRESS, EMAIL_PROVIDER, PUBLIC_URL; `wrangler deploy`; add custom domain news-api.launchpaddigitalfl.com.
