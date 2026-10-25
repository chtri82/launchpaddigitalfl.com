#!/usr/bin/env python3
"""Fetch Florida RSS/Atom feeds and write static JSON for /news/.
Stores only headline, source, date, a short excerpt and the original link."""
import json, re, os, sys, html, time, calendar, concurrent.futures as cf
from datetime import datetime, timezone
import feedparser, requests

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
    bad = [s for s in status if s['status'] != 'ok']
    print(f"{len(status)} feeds, {len(bad)} not ok: {[b['id']+':'+b['status'] for b in bad]}")
    return 0

if __name__ == '__main__': sys.exit(main())
