"""Build /special-reports/ and add a 'Special Reports' tab to every page's primary nav.

Usage: python3 tools/special_reports.py <site_dir>
Reads <site_dir>/special-reports.json (publications + reports). Idempotent: safe to run after every rebuild.
"""
import datetime, html, json, os, re, sys

NAV_HREF = '/special-reports/'
NAV_LI = '<li><a href="/special-reports/">Special Reports</a></li>'
MARK = 'data-lp-special-report'
e = lambda s: html.escape(str(s), quote=True)


def load(site):
    return json.load(open(os.path.join(site, 'special-reports.json')))


def fmt_date(iso):
    d = datetime.date.fromisoformat(iso)
    return d.strftime('%b. ') + str(d.day) + d.strftime(', %Y')


def group(data):
    """Return [(publication, [reports newest first])] in publication order; unknown publications raise."""
    keys = {p['key'] for p in data['publications']}
    for r in data['reports']:
        if r['publication'] not in keys:
            raise ValueError(f"unknown publication {r['publication']!r} for {r['url']}")
    return [(p, sorted([r for r in data['reports'] if r['publication'] == p['key']], key=lambda r: r['date'], reverse=True))
            for p in data['publications']]


def launchpad_only(groups):
    """The Launchpad /special-reports/ page lists only Launchpad reports (the Condo & HOA Brief has its own site)."""
    return [(p, r) for p, r in groups if p['key'] == 'launchpad']


def add_nav(h):
    """Insert the Special Reports tab after News in #primary-nav (once). Pages without the nav are returned unchanged."""
    m = re.search(r'(<ul id="primary-nav"[^>]*>)(.*?)(</ul>)', h, flags=re.S)
    if not m or f'href="{NAV_HREF}"' in m.group(2):
        return h
    inner = m.group(2)
    news = re.search(r'<li><a href="/news/"[^>]*>News</a></li>', inner)
    inner = inner[:news.end()] + NAV_LI + inner[news.end():] if news else inner + NAV_LI
    return h[:m.start()] + m.group(1) + inner + m.group(3) + h[m.end():]


def render_cards(groups):
    out = []
    for p, reps in groups:
        out.append(f'<h2>{e(p["name"])}</h2>')
        if not reps:
            out.append(f'<p>No special reports yet. <a href="{e(p["url"])}">Visit {e(p["name"])}</a>.</p>')
            continue
        out.append('<div class="grid grid-3">')
        for r in reps:
            out.append(f'<article class="card" {MARK}="{e(p["key"])}"><span class="tag">Special Report</span>'
                       f'<h3 style="margin-top:.6rem"><a href="{e(r["url"])}">{e(r["title"])}</a></h3>'
                       f'<p>{e(r["summary"])}</p><p style="color:var(--text-muted);font-size:.9rem">By {e(r["byline"])} · {fmt_date(r["date"])}</p></article>')
        out.append('</div>')
    return '\n'.join(out)


def render_page(template, groups):
    """Reuse an existing page's header/footer so styling and nav match the rest of the site."""
    a, b = template.index('<main id="main">'), template.index('</main>')
    head = re.sub(r'<title>.*?</title>', '<title>Special Reports | Launchpad Digital</title>', template[:a], count=1, flags=re.S)
    head = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="Special reports from Launchpad Digital.">', head, count=1)
    head = re.sub(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="https://launchpaddigitalfl.com/special-reports/">', head, count=1)
    head = head.replace(' aria-current="page"', '')
    head = head.replace(f'<a href="{NAV_HREF}">', f'<a href="{NAV_HREF}" aria-current="page">')
    main = ('<main id="main">\n<section class="page-hero"><div class="wrap"><span class="eyebrow">Special Reports</span>'
            '<h1>Special Reports</h1><p>In-depth reports from Launchpad Digital, newest first.</p></div></section>\n'
            f'<section class="block"><div class="wrap">\n{render_cards(groups)}\n</div></section>\n')
    return head + main + template[b:]


def html_files(site):
    for root, dirs, files in os.walk(site):
        dirs[:] = [d for d in dirs if not d.startswith(('.', '_')) and d != 'node_modules']
        for f in files:
            if f.endswith('.html'):
                yield os.path.join(root, f)


def build(site):
    changed = 0
    for f in html_files(site):
        h = open(f, encoding='utf-8').read(); n = add_nav(h)
        if n != h:
            open(f, 'w', encoding='utf-8').write(n); changed += 1
    tpl = add_nav(open(os.path.join(site, 'archive', 'index.html'), encoding='utf-8').read())
    os.makedirs(os.path.join(site, 'special-reports'), exist_ok=True)
    open(os.path.join(site, 'special-reports', 'index.html'), 'w', encoding='utf-8').write(render_page(tpl, launchpad_only(group(load(site)))))
    return changed


if __name__ == '__main__':
    print('nav added to', build(sys.argv[1]), 'pages')
