"""Make page sections collapsible with native <details open>/<summary> (works without JS, keyboard accessible).
Applied to the home page, section index pages, Breaking, Around the State, briefs, Special Reports and the archive.
Never to article bodies. Idempotent."""
import os, re

CLS = 'lp-collapse'
LEAF_RE = re.compile(r'(<div[^>]*>)((?:(?!<div|</div>).)*?<h2(?:(?!<div|</div>).)*)(</div>)', re.S)
SEC_RE = re.compile(r'(<section class="(?:block|lp-)[^"]*"[^>]*>\s*<div class="wrap[^"]*">)(.*?)(</div>\s*</section>)', re.S)
HEAD_RE = re.compile(r'(?:<span class="eyebrow">[^<]*</span>\s*)?<h2([^>]*)>(.*?)</h2>', re.S)


def details(summary, body):
    return f'<details class="{CLS}" open><summary>{summary}</summary>{body}</details>'


UNWRAP_RE = re.compile(r'<details class="lp-collapse"[^>]*><summary>(.*?)</summary>(.*?)</details>', re.S)


def strip_cta(html):
    """Signup/call-to-action boxes are never collapsible (a collapsed CTA hides the signup, and the generic
    details background made CTA text white-on-white). Unwrap any lp-collapse added by earlier builds."""
    while UNWRAP_RE.search(html):
        html = UNWRAP_RE.sub(r'\1\2', html)
    return html


def collapse_sections(main):
    """Each <section class="block"> whose .wrap has an h2 becomes one collapsible group (heading = summary)."""
    def fix(m):
        inner = m.group(2)
        if '<section' in inner:
            return m.group(0)
        if 'class="cta' in inner:
            return m.group(1) + strip_cta(inner) + m.group(3)
        if CLS in inner:
            return m.group(0)
        hm = HEAD_RE.search(inner)
        if not hm:
            return m.group(0)
        if len(re.findall(r'<h2[ >]', inner)) > 1 or not m.group(1).endswith('<div class="wrap">'):
            # grids / call-to-action boxes: make each innermost block with a heading collapsible
            return m.group(1) + LEAF_RE.sub(lambda d: d.group(1) + collapse_h2_groups(d.group(2)) + d.group(3), inner) + m.group(3)
        body = inner[:hm.start()] + inner[hm.end():]
        if not re.sub(r'<[^>]+>|\s', '', body):
            return m.group(0)  # header-only group label
        return m.group(1) + details(hm.group(0), body) + m.group(3)
    return SEC_RE.sub(fix, main)


def collapse_h2_groups(container):
    """Within one container, each <h2> and the content up to the next <h2> becomes a collapsible group."""
    if CLS in container:
        return container
    parts = re.split(r'(?=<span class="eyebrow">[^<]*</span>\s*<h2[ >])|(?<!</span>)(?=<h2[ >])', container)
    out = [parts[0]]
    for p in parts[1:]:
        hm = HEAD_RE.match(p)
        out.append(details(hm.group(0), p[hm.end():]))
    return ''.join(out)


def apply_page(h, rel):
    a = h.find('<main id="main">'); b = h.find('</main>')
    if a < 0 or b < 0 or rel.startswith('articles' + os.sep):
        return h
    main = h[a:b]
    top = rel.split(os.sep)[0]
    if top in ('special-reports', 'archive'):
        main = re.sub(r'(<section class="block"><div class="wrap">)(.*?)(</div></section>)',
                      lambda m: m.group(1) + collapse_h2_groups(m.group(2)) + m.group(3) if '<h2' in m.group(2) else m.group(0),
                      main, count=1, flags=re.S)
    elif rel.startswith(os.path.join('news', 'briefs') + os.sep) and rel.count(os.sep) == 3:
        main = re.sub(r'(<article class="prose article-body">)(.*?)(</article>)',
                      lambda m: m.group(1) + collapse_h2_groups(m.group(2)) + m.group(3), main, count=1, flags=re.S)
    else:
        main = collapse_sections(main)
    return h[:a] + main + h[b:]


def targets(site):
    yield 'index.html'
    for d in ('breaking', 'around-the-state', 'special-reports', 'archive', 'news'):
        yield os.path.join(d, 'index.html')
    for d in sorted(os.listdir(os.path.join(site, 'news'))):
        if os.path.isfile(os.path.join(site, 'news', d, 'index.html')):
            yield os.path.join('news', d, 'index.html')
    bd = os.path.join(site, 'news', 'briefs')
    for d in sorted(os.listdir(bd)):
        if os.path.isfile(os.path.join(bd, d, 'index.html')):
            yield os.path.join('news', 'briefs', d, 'index.html')


def build(site):
    n = 0
    for rel in dict.fromkeys(targets(site)):
        p = os.path.join(site, rel)
        if not os.path.isfile(p):
            continue
        h = open(p, encoding='utf-8').read(); x = apply_page(h, rel)
        if x != h:
            open(p, 'w', encoding='utf-8').write(x); n += 1
    return n
