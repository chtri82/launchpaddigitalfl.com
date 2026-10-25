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

## Local news by ZIP (optional)
- Signup/preferences take an optional ZIP. `data/fl-geo.json` (also served at `/assets/data/fl-geo.json`) bundles free U.S. Census 2020 files: ZCTA5-to-county relationship (1,013 FL ZIPs, 137 span 2+ counties → subscriber picks) and National Place by County (970 FL place-county rows: incorporated places + CDPs, CDPs marked unincorporated). Subscriber then picks "All of <County>" or specific cities.
- D1: `zip`, `county`, `cities` (JSON; `[]` = all of county) via migrations 0002/0003. Invalid input is dropped server-side.
- Local stories take `"cities": [...]` and/or `"counties": [...]` (`"region:Central"`, `"statewide"`; none = statewide). Order per subscriber: their cities → county → elsewhere in county → region → statewide → everything else (never empty). Regions in `src/counties.js` are our own editorial grouping.
- Tests: `npm test` (unit) and `scripts/test-local.sh` (end-to-end against `wrangler dev`).

## Multiple locations + Around Florida
- Subscribers can save several locations: any number of ZIPs (county looked up; multi-county ZIPs pick one) and/or counties picked from the list of all 67. Each location is "All of <County>" or specific cities. Signup page sends a JSON `locations` field; `/preferences` edits each location, removes it, or adds another (ZIP or county list).
- D1: `locations` JSON list `[{zip, county, cities}]` (migration 0004 migrates the old single zip/county/cities; those columns now mirror the first location). Everything is validated against `data/fl-geo.json` (`resolveLocations`; duplicate counties merge).
- Top 3 Local Stories are picked across all locations: cities → counties → elsewhere in those counties → regions → statewide → rest.
- After the regular sections, **Around Florida** lists every other local story (not in the reader's top 3) by region (Panhandle, North, Central, Space Coast, Tampa Bay, South), then Statewide: headline, one-line summary, county label, Read more. Nothing is dropped, only reordered.
