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


def test_home_refresh_pulls_new_breaking_into_top_group():
    data = {'publications': [{'key': 'launchpad', 'name': 'Launchpad Digital', 'url': '/'}],
            'reports': [{'publication': 'launchpad', 'title': 'SR', 'url': '/sr/', 'summary': 's', 'date': '2026-10-29'}]}
    h = hl.regroup(HOME, data)
    h2 = h.replace('<article class="news-item">plain</article>', '<article class="news-item" data-homepin="1">PIN</article><article class="news-item">plain</article>')
    out = hl.regroup(h2, data)
    assert out.count('id="home-breaking"') == 1 and out.count('id="home-special-reports"') == 1
    assert out.index('PIN') < out.index('id="home-special-reports"') < out.index('plain')
    assert hl.regroup(out, data) == out


def test_separate_ours_moves_block_out_of_outlet_section():
    import separate_ours as so
    h = ('<main id="main"><section class="block"><div class="wrap"><h2>What\'s happening around Florida.</h2><div class="news-list">'
         '<!--lp-ours--><h3 class="lp-grp" style="x">From Launchpad: our own reporting</h3><article>OURS</article><!--/lp-ours-->'
         '<!--lp-live--><article>OUTLET</article><!--/lp-live--></div></div></section></main>')
    out = so.separate(h)
    assert out.index('id="from-launchpad"') < out.index('OURS') < out.index("What's happening") < out.index('OUTLET')
    assert out.count('From Launchpad: our own reporting') == 1 and so.separate(out) == out


def test_collapsible_wraps_heading_in_summary_and_is_idempotent():
    import collapsible as c
    h = ('<main id="main"><section class="hero"><div class="wrap"><h1>x</h1></div></section>'
         '<section class="block"><div class="wrap"><span class="eyebrow">E</span><h2>Title</h2><p>Body</p></div></section>'
         '<section class="block"><div class="wrap"><h2>Label only</h2></div></section></main>')
    out = c.apply_page(h, 'index.html')
    assert '<details class="lp-collapse" open><summary><span class="eyebrow">E</span><h2>Title</h2></summary><p>Body</p></details>' in out
    assert out.count('<details') == 1 and c.apply_page(out, 'index.html') == out
    assert c.apply_page(h, os.path.join('articles', 'x', 'index.html')) == h


def test_collapse_h2_groups():
    import collapsible as c
    out = c.collapse_h2_groups('<h2>A</h2><p>1</p><h2>B</h2><p>2</p>')
    assert out == '<details class="lp-collapse" open><summary><h2>A</h2></summary><p>1</p></details><details class="lp-collapse" open><summary><h2>B</h2></summary><p>2</p></details>'


def test_special_reports_page_is_launchpad_only():
    data = {'publications': [{'key': 'launchpad', 'name': 'Launchpad Digital', 'url': '/'}, {'key': 'condo-brief', 'name': 'Florida Condo & HOA Brief', 'url': 'https://condohoabrief.com/'}],
            'reports': [{'publication': 'launchpad', 'title': 'LP', 'url': '/a/', 'summary': 's', 'byline': 'b', 'date': '2026-10-29'},
                        {'publication': 'condo-brief', 'title': 'CB', 'url': 'https://condohoabrief.com/p/x/', 'summary': 's', 'byline': 'b', 'date': '2026-10-30'}]}
    out = sr.render_cards(sr.launchpad_only(sr.group(data)))
    assert 'LP' in out and 'CB' not in out and 'Condo' not in out
    assert 'CB' not in hl.special_reports_section(data)


def test_cachebust_versions_local_assets_idempotently(tmp_path):
    import cachebust as c
    (tmp_path / 'assets' / 'css').mkdir(parents=True)
    (tmp_path / 'assets' / 'css' / 'site.css').write_text('a{}')
    h = '<link rel="stylesheet" href="/assets/css/site.css"><link href="https://x.com/a.css">'
    out = c.apply(h, str(tmp_path), {})
    assert '/assets/css/site.css?v=' in out and 'https://x.com/a.css"' in out
    assert c.apply(out, str(tmp_path), {}) == out
