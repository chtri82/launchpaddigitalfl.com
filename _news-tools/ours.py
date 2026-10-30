#!/usr/bin/env python3
"""Launchpad's own stories for the homepage and /around-the-state/ ("From Launchpad").
Source of truth: news/data/ours.json (written by build_site.py on every site build) plus any
news/briefs/<edition>/index.html pages found in the repo. Used by build_site.py and fetch_news.py
so both rebuilds and the hourly feed refresh keep the same order: breaking, ours, other outlets."""
import json, os, re, html
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
WINDOW_H = 72
LIMITS = {'index.html': 4, 'around-the-state/index.html': 8}
Z = '%Y-%m-%dT%H:%M:%SZ'

def to_utc(iso):
    t = datetime.fromisoformat(iso)
    if t.tzinfo is None: t = t.replace(tzinfo=ET)
    return t.astimezone(timezone.utc)

def fmt_et(t):
    t = t.astimezone(ET)
    return t.strftime('%b. ') + str(t.day) + t.strftime(', %-I:%M %p ET')

def scan_briefs(root):
    out = []; base = os.path.join(root, 'news', 'briefs')
    if not os.path.isdir(base): return out
    for name in sorted(os.listdir(base)):
        p = os.path.join(base, name, 'index.html')
        if not os.path.isfile(p): continue
        s = open(p, encoding='utf-8').read()
        m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S) or re.search(r'<title>(.*?)</title>', s, re.S)
        if not m: continue
        title = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).replace(' | Launchpad Digital', '').strip()
        d = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', s)
        t = (re.search(r'<meta[^>]+article:published_time"[^>]+content="([^"]+)"', s)
             or re.search(r'<time[^>]+datetime="([^"]+)"', s)
             or re.search(r'(20\d\d-\d\d-\d\d(?:T[\d:]+(?:Z|[+-]\d\d:\d\d)?)?)', name))
        if not t: continue
        iso = t.group(1)
        if len(iso) == 10: iso += 'T12:00:00'
        out.append({'t': title, 'u': '/news/briefs/%s/' % name, 'x': html.unescape(d.group(1)) if d else '',
                    'd': to_utc(iso).strftime(Z), 'k': 'Brief', 'by': 'Launchpad Digital'})
    return out

def ours_items(root, limit, exclude=(), now=None):
    now = now or datetime.now(timezone.utc)
    items = []
    mp = os.path.join(root, 'news', 'data', 'ours.json')
    if os.path.exists(mp): items += json.load(open(mp, encoding='utf-8'))
    items += scan_briefs(root)
    seen, out = set(), []
    for it in sorted(items, key=lambda i: i['d'], reverse=True):
        t = datetime.strptime(it['d'], Z).replace(tzinfo=timezone.utc)
        if now - t > timedelta(hours=WINDOW_H) or t > now + timedelta(minutes=5): continue
        if it['u'] in seen or it['u'] in exclude: continue
        seen.add(it['u']); out.append(it)
        if len(out) >= limit: break
    return out

def render_ours(items):
    if not items: return ''
    e = lambda s: html.escape(s, quote=True)
    head = ''  # the 'From Launchpad' section header lives outside this block (tools/separate_ours.py)
    arts = ''.join(
        '<article class="news-item reveal" style="border-left-color:var(--orange)"><span class="tag">From Launchpad</span> '
        '<time datetime="%s">%s</time><h3><a href="%s">%s</a></h3>%s<p class="src">%s · %s</p></article>' % (
            e(it['d']), e(fmt_et(datetime.strptime(it['d'], Z).replace(tzinfo=timezone.utc))), e(it['u']), e(it['t']),
            ('<p>' + e(it['x']) + '</p>') if it.get('x') else '', e(re.sub(r'^(?!By )', 'By ', it.get('by', 'Launchpad Digital'))), e(it.get('k', 'Story')))
        for it in items)
    return head + arts

def apply_ours(root=ROOT):
    """Rewrite the <!--lp-ours--> block on the homepage and /around-the-state/."""
    for rel, limit in LIMITS.items():
        p = os.path.join(root, rel)
        if not os.path.exists(p): continue
        s = open(p, encoding='utf-8').read()
        brk = re.search(r'<!--lp-breaking-->(.*?)<!--/lp-breaking-->', s, re.S)
        excl = set(re.findall(r'href="([^"]+)"', brk.group(1))) if brk else set()
        block = '<!--lp-ours-->' + render_ours(ours_items(root, limit, excl)) + '<!--/lp-ours-->'
        if '<!--lp-ours-->' in s:
            s2 = re.sub(r'<!--lp-ours-->.*?<!--/lp-ours-->', lambda m: block, s, count=1, flags=re.S)
        elif '<!--/lp-breaking-->' in s:
            s2 = s.replace('<!--/lp-breaking-->', '<!--/lp-breaking-->' + block, 1)
        else:
            s2 = s.replace('<!--lp-live-->', block + '<!--lp-live-->', 1)
        if s2 != s: open(p, 'w', encoding='utf-8').write(s2)

if __name__ == '__main__':
    apply_ours()
