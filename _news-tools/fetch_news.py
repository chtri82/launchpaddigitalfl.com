#!/usr/bin/env python3
"""Fetch Florida RSS/Atom feeds and write static JSON for /news/.
Stores only headline, source, date, a short excerpt and the original link."""
import json, re, os, sys, html, time, calendar, concurrent.futures as cf
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import feedparser, requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ours

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'news', 'data')
UA = 'Mozilla/5.0 (compatible; LaunchpadDigitalNewsBot/1.0; +https://launchpaddigitalfl.com/news/)'
MAX_AGE_DAYS = 10
CRIME = re.compile(r"\b(arrest(ed|s)?|sheriff'?s?|police|deput(y|ies)|shooting|shot|stabb(ed|ing)|homicide|murder(ed)?|killed|charged|indicted|robbery|burglar(y|ies)|theft|fraud|scam|crash|DUI|manslaughter|sentenced|inmate|jail|suspect|trooper|FDLE|missing (man|woman|child|teen))\b", re.I)
BUDGET = re.compile(r"\b(budget(s|ing)?|tax(es)?|property tax|millage|homestead|insurance (rates?|premiums?)|premiums?|cost of living|inflation|rent(s|al)?|afford(able|ability)|gas prices|utility (bills?|rates?)|electric (bills?|rates?)|FPL|Citizens Property|wages?|minimum wage|SNAP|food prices|grocer(y|ies)|mortgage|paycheck|savings|toll(s)?)\b", re.I)
WX = re.compile(r"\b(hurricane|tropical|storm|flood(ing)?|tornado|weather|heat (advisory|index)|cold front|red tide|rain(fall)?|drought|National Weather Service|NWS|forecast)\b", re.I)

def clean(s, n=240):
    s = re.sub(r'<[^>]+>', ' ', s or ''); s = html.unescape(s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'(The post .* appeared first on .*$)|(\[…\]|\[\.\.\.\])$', '', s).strip()
    return (s[:n].rsplit(' ', 1)[0] + '…') if len(s) > n else s

def fetch(feed):
    try:
        r = requests.get(feed['url'], headers={'User-Agent': UA}, timeout=25)
        r.raise_for_status()
        p = feedparser.parse(r.content)
    except Exception as e:
        return feed, [], f'error: {e.__class__.__name__}'
    items, now = [], time.time()
    for e in p.entries[:40]:
        t = e.get('published_parsed') or e.get('updated_parsed')
        ts = calendar.timegm(t) if t else None
        if ts and now - ts > MAX_AGE_DAYS * 86400: continue
        if ts and ts > now + 86400: ts = now
        title = clean(e.get('title'), 200); link = e.get('link')
        if not title or not link: continue
        ex = clean(e.get('summary') or e.get('description'))
        if ex.lower().startswith(title.lower()[:40]): ex = clean(ex[len(title):]) if len(ex) > len(title) + 20 else ''
        items.append({'t': title, 'u': link, 's': feed['name'], 'sid': feed['id'],
                      'd': datetime.fromtimestamp(ts, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') if ts else None,
                      'x': ex})
    return feed, items, 'ok' if items else ('no recent items' if p.entries else 'empty')

def tag(it):
    txt = it['t'] + ' ' + it['x']; c = []
    if CRIME.search(txt): c.append('crime')
    if BUDGET.search(txt): c.append('budgeting')
    if WX.search(txt): c.append('weather')
    return c

def top(items, n):
    seen, out = set(), []
    for it in sorted(items, key=lambda i: i['d'] or '', reverse=True):
        k = it['u'].split('?')[0]
        if k in seen: continue
        seen.add(k); out.append(it)
        if len(out) >= n: break
    return out

def slug(c): return re.sub(r'[^a-z]+', '-', c.lower()).strip('-')

ROOT = os.path.join(HERE, '..')
JUNK = re.compile(r"(no tropical cyclones|tropical weather outlook|e-edition|classifieds?|obituar|crossword|horoscope|sudoku|legal notices?|public notices?|podcast|newsletter signup)", re.I)
FL_GROUPS = ('statewide', 'politics', 'budgeting', 'weather')   # outlets that are Florida-only by nature
ET = ZoneInfo('America/New_York')

def norm(t): return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()[:70]

def live_items(cfg, by, counties, limit, max_per=2):
    """Fresh Florida headlines for the homepage. Only real feed items; every one keeps its original link."""
    names = [c + ' County' for c in counties] + [x for v in counties.values() for x in v]
    fl = re.compile(r"\b(Florida|Fla\.|Floridians?|" + '|'.join(re.escape(n) for n in names) + r")\b")
    now = time.time(); cands = []
    for g in cfg:
        for feed in cfg[g]:
            for it in by.get(feed['id'], []):
                if not it['d'] or JUNK.search(it['t']) or 'crime' in it['c']: continue
                if g not in FL_GROUPS and not fl.search(it['t'] + ' ' + it['x']): continue
                age = now - calendar.timegm(time.strptime(it['d'], '%Y-%m-%dT%H:%M:%SZ'))
                cands.append((age, it))
    cands.sort(key=lambda a: a[0])
    for horizon in (36, 72, 168):
        pool = [it for age, it in cands if age <= horizon * 3600]
        out, seen, per = [], set(), {}
        for it in pool:
            k = norm(it['t'])
            if k in seen or per.get(it['sid'], 0) >= max_per: continue
            seen.add(k); per[it['sid']] = per.get(it['sid'], 0) + 1; out.append(it)
            if len(out) >= limit: break
        if len(out) >= min(limit, 6): return out
    return out

def fmt_et(iso):
    t = datetime.strptime(iso, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).astimezone(ET)
    return t.strftime('%b. ') + str(t.day) + t.strftime(', %-I:%M %p ET')

def render_live(items, gen):
    e = html.escape
    head = ('<h3 class="lp-grp" style="margin:1rem 0 0;font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">'
            'From other Florida outlets</h3>')
    arts = head + ''.join(
        '<article class="news-item reveal"><time datetime="%s">%s</time><h3><a href="%s" rel="noopener">%s</a></h3>%s'
        '<p class="src">From another outlet · Source: <a href="%s" rel="noopener">%s</a></p></article>' % (
            e(it['d']), e(fmt_et(it['d'])), e(it['u'], quote=True), e(it['t']),
            ('<p>' + e(it['x']) + '</p>') if it['x'] else '', e(it['u'], quote=True), e(it['s'])) for it in items)
    g = datetime.strptime(gen, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
    asof = ('<p class="asof"><span class="dot" aria-hidden="true"></span>Headlines from other Florida outlets, each credited and linked to the original reporting. Last check <time datetime="%s">%s</time>.</p>') % (gen, e(fmt_et(gen)))
    return arts, asof

def write_pages(cfg, by, counties, gen):
    ours.apply_ours(ROOT)
    for rel, limit in (('index.html', 8), ('around-the-state/index.html', 20)):
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p): continue
        s = open(p, encoding='utf-8').read()
        if '<!--lp-live-->' not in s: continue
        arts, asof = render_live(live_items(cfg, by, counties, limit), gen)
        s = re.sub(r'<!--lp-live-->.*?<!--/lp-live-->', lambda m: '<!--lp-live-->' + arts + '<!--/lp-live-->', s, count=1, flags=re.S)
        s = re.sub(r'<!--lp-live-asof-->.*?<!--/lp-live-asof-->', lambda m: '<!--lp-live-asof-->' + asof + '<!--/lp-live-asof-->', s, count=1, flags=re.S)
        open(p, 'w', encoding='utf-8').write(s)

def main():
    cfg = json.load(open(os.path.join(HERE, 'feeds.json')))
    counties = {}
    for line in open(os.path.join(HERE, 'counties.txt')):
        n, cities = line.strip().split('|'); counties[n] = cities.split(',')
    allfeeds = [(g, f) for g in cfg for f in cfg[g]]
    status, by = [], {}
    with cf.ThreadPoolExecutor(8) as ex:
        for (g, _), (f, items, st) in zip(allfeeds, ex.map(lambda gf: fetch(gf[1]), allfeeds)):
            for it in items: it['c'] = tag(it)
            by[f['id']] = items
            status.append({'id': f['id'], 'name': f['name'], 'group': g, 'url': f['url'], 'home': f['home'],
                           'counties': f.get('counties'), 'status': st, 'items': len(items)})
    os.makedirs(os.path.join(OUT, 'county'), exist_ok=True)
    G = lambda g: [it for f in cfg[g] for it in by[f['id']]]
    local_all = G('local')
    state = {
      'politics': top(G('politics'), 40),
      'budgeting': top(G('budgeting') + [i for i in G('politics') + G('statewide') + local_all if 'budgeting' in i['c']], 40),
      'crime': top([i for i in G('statewide') + local_all if 'crime' in i['c']], 40),
      'weather': top(G('weather') + [i for i in G('statewide') + local_all if 'weather' in i['c']], 30),
      'statewide': top(G('statewide') + local_all, 40),
    }
    gen = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    json.dump({'generated': gen, 'sections': state}, open(os.path.join(OUT, 'statewide.json'), 'w'), separators=(',', ':'))
    cov = {}
    for cn, cities in counties.items():
        fs = [f for f in cfg['local'] if cn in f['counties']]
        working = [f for f in fs if by[f['id']]]
        pat = re.compile(r'\b(' + '|'.join(re.escape(x) for x in [cn + ' County'] + cities) + r')\b', re.I)
        items, regional = [], []
        for f in working:
            for it in by[f['id']]:
                it2 = dict(it); it2['m'] = bool(pat.search(it['t'] + ' ' + it['x']))
                # wide regional feeds: keep only stories that mention the county or its cities
                if len(f['counties']) > 3 and not it2['m']: regional.append(it2); continue
                items.append(it2)
        items = top(items, 60)
        if len(items) < 20: items += top(regional, 20 - len(items))
        items = sorted(items, key=lambda i: (not i['m']))[:40]
        dedicated = [f['id'] for f in working if len(f['counties']) <= 3]
        cov[cn] = {'slug': slug(cn), 'feeds': [f['id'] for f in working], 'dedicated': dedicated, 'items': len(items)}
        json.dump({'county': cn, 'generated': gen, 'feeds': [{'name': f['name'], 'home': f['home']} for f in working],
                   'items': items}, open(os.path.join(OUT, 'county', slug(cn) + '.json'), 'w'), separators=(',', ':'))
    json.dump({'generated': gen, 'feeds': status, 'counties': cov}, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
    write_pages(cfg, by, counties, gen)
    bad = [s for s in status if s['status'] != 'ok']
    print(f"{len(status)} feeds, {len(bad)} not ok: {[b['id']+':'+b['status'] for b in bad]}")
    return 0

if __name__ == '__main__': sys.exit(main())
