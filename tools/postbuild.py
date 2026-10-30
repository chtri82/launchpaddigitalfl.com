"""Run after the site builder: python3 tools/postbuild.py <site_dir>. Adds the Special Reports page/nav and regroups the home page."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import special_reports, home_layout

if __name__ == '__main__':
    site = sys.argv[1]
    special_reports.build(site)
    p = os.path.join(site, 'index.html'); h = open(p, encoding='utf-8').read()
    open(p, 'w', encoding='utf-8').write(home_layout.regroup(h, special_reports.load(site)))
    print('postbuild ok')
