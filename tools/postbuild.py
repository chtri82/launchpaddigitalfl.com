"""Run after the site builder: python3 tools/postbuild.py <site_dir>. Adds the Special Reports page/nav and regroups the home page."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import special_reports, home_layout, separate_ours, collapsible, cachebust

if __name__ == '__main__':
    site = sys.argv[1]
    special_reports.build(site)
    p = os.path.join(site, 'index.html'); h = open(p, encoding='utf-8').read()
    open(p, 'w', encoding='utf-8').write(home_layout.regroup(h, special_reports.load(site)))
    for rel in ('index.html', 'around-the-state/index.html'):
        q = os.path.join(site, rel)
        if os.path.isfile(q):
            t = open(q, encoding='utf-8').read(); u = separate_ours.separate(t)
            if u != t: open(q, 'w', encoding='utf-8').write(u)
    print('collapsible pages:', collapsible.build(site))
    print('cache-busted pages:', cachebust.build(site))
    print('postbuild ok')
