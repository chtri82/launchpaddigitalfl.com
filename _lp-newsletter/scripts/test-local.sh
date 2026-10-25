#!/usr/bin/env bash
# Local end-to-end test against `wrangler dev` (EMAIL_PROVIDER=log). Usage: scripts/test-local.sh
set -u; B=${B:-http://localhost:8787}; ADMIN=$(grep ADMIN_TOKEN .dev.vars | cut -d= -f2)
DB="npx wrangler d1 execute lp-newsletter --local --json --command"
pass=0; fail=0; ok(){ if eval "$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
$DB "DELETE FROM rate_limits" >/dev/null 2>&1
E="tester$RANDOM@example.com"
r=$(curl -s -H 'accept: application/json' -H 'origin: http://localhost:8080' -X POST $B/api/subscribe -d "email=$E&name=Test&sections=local&sections=weather&frequency=daily&frequency=breaking")
ok "subscribe returns ok" '[[ $r == *"\"ok\":true"* ]]'
row=$($DB "SELECT status,token,sections,frequencies FROM subscribers WHERE email='$E'" 2>/dev/null)
TOK=$(echo "$row" | grep -o '"token": *"[a-f0-9]*"' | grep -o '[a-f0-9]\{48\}')
ok "row pending with prefs" '[[ $row == *pending* && $row == *weather* && $row == *breaking* ]]'
ok "confirm email logged" 'grep -q "Confirm your Launchpad" /tmp/wdev.log'
r=$(curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=bot@example.com&website=spam")
ok "honeypot fakes success" '[[ $r == *"\"ok\":true"* ]]'
ok "honeypot stored nothing" '[[ $($DB "SELECT COUNT(*) n FROM subscribers WHERE email=\"bot@example.com\"" 2>/dev/null) == *"\"n\": 0"* ]]'
r=$(curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=not-an-email")
ok "invalid email rejected" '[[ $r == *"valid email"* ]]'
ok "bad token rejected" '[[ $(curl -s "$B/confirm?token=abc") == *"not valid"* ]]'
ok "confirm page" '[[ $(curl -s "$B/confirm?token=$TOK") == *"subscribed"* ]]'
ok "status active" '[[ $($DB "SELECT status FROM subscribers WHERE email=\"$E\"" 2>/dev/null) == *active* ]]'
ok "prefs page" '[[ $(curl -s "$B/preferences?token=$TOK") == *"value=\"weather\" checked"* ]]'
curl -s -X POST "$B/preferences?token=$TOK" -d "sections=money&sections=sports&frequency=weekly" >/dev/null
ok "prefs saved" '[[ $($DB "SELECT sections FROM subscribers WHERE email=\"$E\"" 2>/dev/null) == *money* ]]'
curl -s -X POST "$B/preferences?token=$TOK" -d "sections=local&sections=weather&frequency=daily" >/dev/null
s=$(curl -s -X POST -H 'authorization: Bearer '$ADMIN -H 'content-type: application/json' $B/admin/send -d "{\"id\":\"test-$RANDOM\",\"frequency\":\"daily\",\"subject\":\"Launchpad Daily (TEST)\",\"sections\":{\"weather\":[{\"title\":\"Sample weather item\",\"url\":\"https://www.weather.gov/mlb/\",\"source\":\"NWS Melbourne\",\"summary\":\"Test item.\"}],\"sports\":[{\"title\":\"Not chosen\",\"url\":\"https://example.com\"}]}}")
echo "  send result: $s"
sleep 1; ok "issue sent" '[[ $s == *"\"sent\":"[1-9]* ]]'
ok "List-Unsubscribe header" 'grep -q "List-Unsubscribe-Post" /tmp/wdev.log'
ok "send requires auth" '[[ $(curl -s -o /dev/null -w %{http_code} -X POST $B/admin/send -d {}) == 401 ]]'
ok "export requires auth" '[[ $(curl -s -o /dev/null -w %{http_code} $B/admin/export.csv) == 401 ]]'
curl -s -H "authorization: Bearer $ADMIN" $B/admin/export.csv > /tmp/export.csv
ok "export has subscriber" 'grep -q "$E" /tmp/export.csv && head -1 /tmp/export.csv | grep -q "^id,email"'
ok "unsubscribe GET shows button (no auto-unsub)" '[[ $(curl -s "$B/unsubscribe?token=$TOK") == *"<form method=\"post\">"* ]]'
ok "one-click unsubscribe (RFC 8058)" '[[ $(curl -s -X POST -d "List-Unsubscribe=One-Click" "$B/unsubscribe?token=$TOK") == Unsubscribed ]]'
ok "status unsubscribed" '[[ $($DB "SELECT status FROM subscribers WHERE email=\"$E\"" 2>/dev/null) == *unsubscribed* ]]'
for i in 1 2 3 4 5 6; do last=$(curl -s -o /dev/null -w %{http_code} -X POST -H 'accept: application/json' $B/api/subscribe -d "email=rl$i@example.com"); done
ok "rate limit -> 429" '[[ $last == 429 ]]'
ok "CORS for site origin" 'curl -s -i -X OPTIONS -H "origin: http://localhost:8080" $B/api/subscribe | grep -qi "access-control-allow-origin: http://localhost:8080"'
echo "== $pass passed, $fail failed"
