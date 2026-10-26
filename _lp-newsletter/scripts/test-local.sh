#!/usr/bin/env bash
# Local end-to-end test against `wrangler dev` (EMAIL_PROVIDER=log). Usage: scripts/test-local.sh
set -u; B=${B:-http://localhost:8787}; ADMIN=$(grep ADMIN_TOKEN .dev.vars | cut -d= -f2)
DB="npx wrangler d1 execute lp-newsletter --local --json --command"
pass=0; fail=0; ok(){ if eval "$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
$DB "DELETE FROM rate_limits" >/dev/null 2>&1
E="tester$RANDOM@example.com"
r=$(curl -s -H 'accept: application/json' -H 'origin: http://localhost:8080' -X POST $B/api/subscribe -d "email=$E&name=Test&sections=local&sections=weather&frequency=weekly&frequency=monthly&zip=32931&cities=Cocoa%20Beach&cities=Atlantis")
ok "subscribe returns ok" '[[ $r == *"\"ok\":true"* ]]'
row=$($DB "SELECT status,token,sections,frequencies FROM subscribers WHERE email='$E'" 2>/dev/null)
TOK=$(echo "$row" | grep -o '"token": *"[a-f0-9]*"' | grep -o '[a-f0-9]\{48\}')
ok "row pending with prefs" '[[ $row == *pending* && $row == *weather* && $row == *monthly* ]]'
ok "zip/county/cities stored on signup" 'r2=$($DB "SELECT zip,county,cities FROM subscribers WHERE email=\"$E\"" 2>/dev/null); [[ $r2 == *32931* && $r2 == *Brevard* && $r2 == *Cocoa\ Beach* && $r2 != *Atlantis* ]]'
E2="nocounty$RANDOM@example.com"; curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=$E2&zip=" >/dev/null
ok "no county -> NULL" '[[ $($DB "SELECT typeof(county) t FROM subscribers WHERE email=\"$E2\"" 2>/dev/null) == *"\"t\": \"null\""* ]]'
E3="badcounty$RANDOM@example.com"; curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=$E3&zip=10001&county=Orange" >/dev/null
ok "non-Florida ZIP -> NULL county" '[[ $($DB "SELECT typeof(county) t FROM subscribers WHERE email=\"$E3\"" 2>/dev/null) == *"\"t\": \"null\""* ]]'
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
ok "prefs page shows zip, cities + purpose" 'p=$(curl -s "$B/preferences?token=$TOK"); [[ $p == *"value=\"32931\""* && $p == *"value=\"Cocoa Beach\" checked"* && $p == *"All of Brevard County"* && $p == *"Around Florida"* ]]'
curl -s -X POST "$B/preferences?token=$TOK" -d "sections=money&sections=sports&frequency=weekly" >/dev/null
ok "prefs saved" '[[ $($DB "SELECT sections FROM subscribers WHERE email=\"$E\"" 2>/dev/null) == *money* ]]'
curl -s -X POST "$B/preferences?token=$TOK" -d "sections=local&sections=weather&frequency=weekly&zip=32801" >/dev/null
ok "new ZIP via prefs -> Orange, all of county" 'r2=$($DB "SELECT county,cities FROM subscribers WHERE email=\"$E\"" 2>/dev/null); [[ $r2 == *Orange* && $r2 == *"[]"* ]]'
s=$(curl -s -X POST -H 'authorization: Bearer '$ADMIN -H 'content-type: application/json' $B/admin/send -d "{\"id\":\"test-$RANDOM\",\"frequency\":\"weekly\",\"subject\":\"Launchpad Daily (TEST)\",\"sections\":{\"weather\":[{\"title\":\"Sample weather item\",\"url\":\"https://www.weather.gov/mlb/\",\"source\":\"NWS Melbourne\",\"summary\":\"Test item.\"}],\"local\":[{\"title\":\"BREVARD-ITEM\",\"url\":\"https://x/b\",\"counties\":[\"Brevard\"]},{\"title\":\"ORANGE-ITEM\",\"url\":\"https://x/o\",\"counties\":[\"Orange\"]}],\"sports\":[{\"title\":\"Not chosen\",\"url\":\"https://example.com\"}]}}")
echo "  send result: $s"
sleep 1; ok "issue sent" '[[ $s == *"\"sent\":"[1-9]* ]]'
ok "sent email: Orange local first + change-county link" 'grep -q "Local news set to all of Orange County" /tmp/wdev.log && [[ $(grep -o "ORANGE-ITEM\|BREVARD-ITEM" /tmp/wdev.log | tail -2 | head -1) == ORANGE-ITEM ]]'
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
# Multiple locations (migration 0004)
ok "legacy rows migrated to locations list" '[[ $($DB "SELECT COUNT(*) n FROM subscribers WHERE county IS NOT NULL AND (locations IS NULL OR json_array_length(locations)=0)" 2>/dev/null) == *"\"n\": 0"* ]]'
$DB "DELETE FROM rate_limits" >/dev/null 2>&1
M="multi$RANDOM@example.com"
r=$(curl -s -H 'accept: application/json' -X POST $B/api/subscribe --data-urlencode "email=$M" --data-urlencode 'locations=[{"zip":"32931","cities":["Cocoa Beach","Orlando"]},{"county":"Orange","cities":[]},{"zip":"10001"},{"county":"Atlantis"}]' -d "sections=local&frequency=weekly")
ok "multi-location signup ok" '[[ $r == *"\"ok\":true"* ]]'
ok "multi-location stored + validated" 'r2=$($DB "SELECT locations,county FROM subscribers WHERE email=\"$M\"" 2>/dev/null); [[ $r2 == *Brevard* && $r2 == *Orange* && $r2 == *Cocoa\ Beach* && $r2 != *Orlando* && $r2 != *Atlantis* && $r2 != *10001* ]]'
MT=$($DB "SELECT token FROM subscribers WHERE email='$M'" 2>/dev/null | grep -o '[a-f0-9]\{48\}')
curl -s "$B/confirm?token=$MT" >/dev/null
p=$(curl -s "$B/preferences?token=$MT")
ok "prefs lists both locations + add-county list of 67" '[[ $p == *"Brevard County (ZIP 32931)"* && $p == *"<legend>Orange County</legend>"* && $(echo "$p" | grep -o "<select name=\"add_county\">.*</select>" | grep -o "<option>" | wc -l) == 67 ]]'
curl -s -X POST "$B/preferences?token=$MT" -d "sections=local&frequency=weekly&loc_count=2&loc0_zip=32931&loc0_prev=Brevard&loc0_county=Brevard&loc0_cities=all&loc1_zip=&loc1_prev=Orange&loc1_county=Orange&loc1_remove=1&add_county=Leon&add_zip=32801" >/dev/null
ok "prefs: remove Orange, add Leon by list + Orange back by ZIP, Brevard all" 'r2=$($DB "SELECT locations FROM subscribers WHERE email=\"$M\"" 2>/dev/null); [[ $r2 == *Leon* && $r2 == *32801* && $r2 != *Cocoa* ]]'
s=$(curl -s -X POST -H 'authorization: Bearer '$ADMIN -H 'content-type: application/json' $B/admin/send -d "{\"id\":\"multi-$RANDOM\",\"frequency\":\"weekly\",\"subject\":\"Multi TEST\",\"sections\":{\"local\":[{\"title\":\"LEON-ITEM\",\"url\":\"https://x/l\",\"counties\":[\"Leon\"]},{\"title\":\"MIAMI-ITEM\",\"url\":\"https://x/m\",\"counties\":[\"Miami-Dade\"]},{\"title\":\"S1\",\"url\":\"https://x/s1\"},{\"title\":\"S2\",\"url\":\"https://x/s2\"},{\"title\":\"S3\",\"url\":\"https://x/s3\"}]}}")
sleep 1; ok "multi send: footer lists all locations + Around Florida keeps the rest" 'grep -q "Local news set to all of Brevard County; all of Orange County; all of Leon County" /tmp/wdev.log && grep -q "Around Florida" /tmp/wdev.log && grep -q "MIAMI-ITEM" /tmp/wdev.log'
# SMS (migration 0006)
$DB "DELETE FROM rate_limits" >/dev/null 2>&1
P="sms$RANDOM@example.com"
r=$(curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=$P&phone=(321)%20555-1234&sms_daily=1&frequency=weekly")
ok "SMS without consent rejected" '[[ $r == *"check the box"* ]]'
r=$(curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=$P&phone=12345&sms_consent=1&sms_daily=1")
ok "bad phone rejected" '[[ $r == *"valid US mobile"* ]]'
r=$(curl -s -H 'accept: application/json' -X POST $B/api/subscribe -d "email=$P&phone=(321)%20555-1234&sms_consent=1&sms_breaking=1&sms_daily=1&frequency=daily")
ok "SMS signup ok" '[[ $r == *"\"ok\":true"* ]]'
ok "SMS stored pending + daily email dropped to weekly" 'r2=$($DB "SELECT phone_e164,sms_status,sms_breaking,sms_daily,sms_consent_version,frequencies FROM subscribers WHERE email=\"$P\"" 2>/dev/null); [[ $r2 == *+13215551234* && $r2 == *pending* && $r2 == *sms-v1* && $r2 == *weekly* ]]'
PT=$($DB "SELECT token FROM subscribers WHERE email='$P'" 2>/dev/null | grep -o '[a-f0-9]\{48\}')
curl -s "$B/confirm?token=$PT" >/dev/null
ok "confirm activates SMS" '[[ $($DB "SELECT sms_status FROM subscribers WHERE email=\"$P\"" 2>/dev/null) == *active* ]]'
p=$(curl -s "$B/preferences?token=$PT")
ok "prefs shows SMS fields, no daily email" '[[ $p == *"(321) 555-1234"* && $p == *"name=\"sms_daily\" value=\"1\" checked"* && $p != *"value=\"daily\""* ]]'
r=$(curl -s -X POST $B/sms/inbound -d "From=%2B13215551234&Body=STOP")
ok "inbound STOP" '[[ $r == *stop* && $($DB "SELECT sms_status FROM subscribers WHERE email=\"$P\"" 2>/dev/null) == *stopped* ]]'
ok "daily email send refused" '[[ $(curl -s -X POST -H "authorization: Bearer $ADMIN" -H "content-type: application/json" $B/admin/send -d "{\"id\":\"d1\",\"frequency\":\"daily\",\"subject\":\"x\"}") == *"weekly or monthly"* ]]'
N="nophone$RANDOM@example.com"
ok "email-only signup still works" '[[ $(curl -s -H "accept: application/json" -X POST $B/api/subscribe -d "email=$N") == *"\"ok\":true"* && $($DB "SELECT typeof(phone_e164) t FROM subscribers WHERE email=\"$N\"" 2>/dev/null) == *null* ]]'
echo "== $pass passed, $fail failed"
