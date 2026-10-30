"""Builds the site into a temp copy, serves it over HTTP and checks every page."""
import functools, http.server, os, re, shutil, subprocess, sys, threading, urllib.request
import pytest
import site_checks as sc
from conftest import ROOT


@pytest.fixture(scope='module')
def site(tmp_path_factory):
    d = str(tmp_path_factory.mktemp('site') / 'site')
    shutil.copytree(ROOT, d, ignore=shutil.ignore_patterns('.git', 'node_modules', '_lp-newsletter', 'tests', '.github'))
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'postbuild.py'), d], check=True)
    return d


@pytest.fixture(scope='module')
def pages(site):
    return {os.path.relpath(f, site): open(f, encoding='utf-8').read() for f in sc_html(site)}


def sc_html(site):
    import special_reports
    return list(special_reports.html_files(site))


@pytest.fixture(scope='module')
def server(site):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=site))
    srv.RequestHandlerClass.log_message = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{srv.server_port}'
    srv.shutdown()


def test_every_page_returns_200(server, pages):
    bad = []
    for rel in pages:
        url = server + '/' + rel.replace(os.sep, '/').removesuffix('index.html')
        try:
            if urllib.request.urlopen(url).status != 200: bad.append(rel)
        except Exception as ex:
            bad.append(f'{rel}: {ex}')
    assert not bad, bad


def test_no_broken_internal_links(site, pages):
    broken = sorted({f'{rel} -> {p}' for rel, h in pages.items() for p in sc.internal_links(h) if not sc.resolve(site, rel, p)})
    assert not broken, '\n'.join(broken[:50])


def test_nav_present_on_all_pages(pages):
    missing = [rel for rel, h in pages.items() if not sc.is_redirect(h) and rel != '404.html' and 'id="primary-nav"' not in h]
    assert not missing, missing


def test_special_reports_tab_on_all_nav_pages(pages):
    missing = [rel for rel, h in pages.items() if 'id="primary-nav"' in h and 'href="/special-reports/"' not in h]
    assert not missing, missing


def test_special_reports_page_lists_stewart(pages):
    h = pages[os.path.join('special-reports', 'index.html')]
    assert 'Patrick Stewart' in h
    main = h[h.index('<main'):h.index('</main>')]
    assert 'Condo' not in main and 'condohoabrief.com' not in main


def test_publications_tab_links_condo_brief(pages):
    assert 'href="/publications/"' in pages['index.html']
    assert 'href="https://condohoabrief.com' in pages[os.path.join('publications', 'index.html')]


def test_home_grouping(pages):
    h = pages['index.html']
    ids = [h.find(f'id="{i}"') for i in ('home-special-reports', 'home-launchpad', 'home-condo-brief')]
    assert -1 not in ids and ids == sorted(ids)


def test_signup_has_new_sections(pages):
    h = pages[os.path.join('subscribe', 'index.html')]
    assert 'value="science-technology"' in h and 'value="special-reports"' in h


def test_theme_text_contrast(site):
    light, dark = sc.css_vars(open(os.path.join(site, 'assets', 'css', 'site.css')).read())
    # light theme: --text=ink, --text-muted=muted on --bg=cream / --surface=paper
    for fg in ('ink', 'muted'):
        for bg in ('cream', 'paper'):
            assert sc.contrast(light[fg], light[bg]) >= 4.5, (fg, bg)
    for fg in ('text', 'text-muted'):
        for bg in ('bg', 'surface'):
            assert sc.contrast(dark[fg], dark[bg]) >= 4.5, (fg, bg)


def test_no_unreadable_inline_grays(site, pages):
    """Inline dark grays are invisible in dark mode unless the stylesheet forces a theme color on them."""
    css = open(os.path.join(site, 'assets', 'css', 'site.css')).read()
    covered = '.lp-media figcaption' in css and 'var(--text-muted)!important' in css
    offenders = []
    for rel, h in pages.items():
        for m in sc.DARK_ONLY_GRAYS.finditer(h):
            ctx = h[max(0, m.start() - 200):m.start()]
            tag = ctx[ctx.rfind('<'):]
            if not (covered and (tag.startswith('<figcaption') or 'lp-credit' in tag)):
                offenders.append(rel); break
    assert not offenders, offenders


LIVE_RE = re.compile(r'<!--lp-live-->(.*?)<!--/lp-live-->', re.S)


def test_outlet_headlines_kept_separate_from_launchpad_stories(pages):
    """'What's happening around Florida' holds only other outlets' credited, linked headlines; ours sit in 'From Launchpad'."""
    checked = 0
    for rel, h in pages.items():
        m = LIVE_RE.search(h)
        if not m:
            continue
        checked += 1
        live = m.group(1)
        assert 'From Launchpad' not in live and '<!--lp-ours-->' not in live, rel
        for art in re.findall(r'<article.*?</article>', live, re.S):
            link = re.search(r'<h3><a href="([^"]+)"', art).group(1)
            assert link.startswith('http') and 'launchpaddigitalfl.com' not in link, (rel, link)
            assert re.search(r'Source: <a href="https?://[^"]+"[^>]*>[^<]+</a>', art), (rel, art[:120])
        live_sec = h[h.rfind('<section', 0, m.start()):m.start()]
        assert 'from-launchpad' not in live_sec and '<!--lp-ours-->' not in live_sec, rel
        if '<!--lp-ours-->' in h:
            o = h.index('<!--lp-ours-->')
            assert h.rfind('id="from-launchpad"', 0, o) > h.rfind('<section', 0, h.rfind('id="from-launchpad"', 0, o) + 1) - 1, rel
            assert h.rfind('<section', 0, o) == h.rfind('<section', 0, h.index('id="from-launchpad"')), rel
    assert checked >= 2


def test_collapsible_sections(pages):
    import collapsible
    home = pages['index.html']
    main = home[home.index('<main id="main">'):home.index('</main>')]
    secs = re.split(r'(?=<section )', main)[1:]
    for s in secs:
        if s.startswith('<section class="hero"') or not re.sub(r'<[^>]+>|\s', '', re.sub(r'<h2.*?</h2>|<span class="eyebrow">.*?</span>', '', s, flags=re.S)):
            continue  # hero and header-only group labels
        assert 'class="lp-collapse" open' in s, s[:160]
    for rel, h in pages.items():
        assert h.count('<details') == h.count('</details>') and h.count('<summary>') == h.count('</summary>'), rel
        for d in re.findall(r'<details class="lp-collapse"[^>]*>\s*<summary>(.*?)</summary>', h, re.S):
            assert '<h2' in d or '<h3' in d, (rel, d[:80])  # tappable, named heading
        assert all('open' in t for t in re.findall(r'<details class="lp-collapse"[^>]*>', h)), rel
        if rel.startswith('articles' + os.sep):
            assert 'lp-collapse' not in h, rel
    for rel in ('special-reports/index.html', 'archive/index.html', 'news/briefs/2026-10-30-midday/index.html', 'breaking/index.html', 'around-the-state/index.html'):
        assert 'class="lp-collapse" open' in pages[rel.replace('/', os.sep)], rel


def test_collapsible_css_indicator_and_focus(site):
    css = open(os.path.join(site, 'assets', 'css', 'site.css')).read()
    assert 'details.lp-collapse>summary::after{content:"−"' in css
    assert 'details.lp-collapse:not([open])>summary::after{content:"+"}' in css
    assert 'details.lp-collapse>summary:focus-visible' in css
