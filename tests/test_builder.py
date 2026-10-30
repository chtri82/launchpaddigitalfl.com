import json, os, shutil
import pytest
import special_reports as sr, home_layout as hl
from conftest import ROOT

NAV = '<ul id="primary-nav"><li><a href="/">Home</a></li><li><a href="/news/">News</a></li><li><a href="/about/">About</a></li></ul>'


def test_add_nav_after_news_and_idempotent():
    h = sr.add_nav(NAV)
    assert h.index('/news/') < h.index('/special-reports/') < h.index('/about/')
    assert sr.add_nav(h) == h and h.count('Special Reports') == 1


def test_add_nav_skips_pages_without_nav():
    assert sr.add_nav('<p>redirect</p>') == '<p>redirect</p>'


def test_group_by_publication_newest_first():
    data = {'publications': [{'key': 'a', 'name': 'A', 'url': '/'}, {'key': 'b', 'name': 'B', 'url': '/'}],
            'reports': [{'publication': 'a', 'date': '2026-01-01', 'url': '/1/'}, {'publication': 'a', 'date': '2026-02-01', 'url': '/2/'}]}
    g = sr.group(data)
    assert [p['key'] for p, _ in g] == ['a', 'b'] and [r['url'] for r in g[0][1]] == ['/2/', '/1/'] and g[1][1] == []


def test_unknown_publication_rejected():
    with pytest.raises(ValueError):
        sr.group({'publications': [], 'reports': [{'publication': 'x', 'url': '/'}]})


def test_stewart_report_tagged():
    data = sr.load(ROOT)
    assert any('Patrick Stewart' in r['title'] and r['publication'] == 'launchpad' for r in data['reports'])
    for r in data['reports']:
        assert os.path.isfile(os.path.join(ROOT, r['url'].strip('/'), 'index.html'))


def test_render_escapes_html():
    out = sr.render_cards([({'key': 'a', 'name': 'A&B', 'url': '/'}, [{'title': '<x>', 'url': '/u/', 'summary': 's', 'byline': 'b', 'date': '2026-10-29'}])])
    assert '&lt;x&gt;' in out and 'A&amp;B' in out and 'Oct. 29, 2026' in out


HOME = ('<main id="main"><section class="hero">H</section><section class="block"><h2>What\'s happening</h2>'
        '<div class="news-list"><!--lp-breaking--><article class="news-item" data-breaking="1">BRK</article><!--/lp-breaking-->'
        '<article class="news-item">plain</article></div></section>'
        '<section class="block alt"><span class="eyebrow">From the Florida Condo &amp; HOA Brief</span><h2>x</h2></section>'
        '<section class="block"><div class="cta"><h2>Signup</h2></div></section></main>')


def test_home_regroup_order_and_idempotent():
    data = {'publications': [{'key': 'launchpad', 'name': 'Launchpad Digital', 'url': '/'}],
            'reports': [{'publication': 'launchpad', 'title': 'SR', 'url': '/sr/', 'summary': 's', 'date': '2026-10-29'}]}
    h = hl.regroup(HOME, data)
    order = [h.index(k) for k in ('class="hero"', 'id="home-breaking"', 'id="home-special-reports"', 'id="home-launchpad"', 'id="home-condo-brief"', 'Signup')]
    assert order == sorted(order)
    assert h.index('BRK') < h.index('id="home-special-reports"') < h.index('plain')
    assert hl.regroup(h, data) == h
