"""Regroup the home page: 1) Breaking & Developing, 2) Special Reports, 3) Launchpad Digital sections,
4) Florida Condo & HOA Brief, then the closing sections (about/how we work/signup). Idempotent."""
import re
from special_reports import e, fmt_date, group

DONE = '<!--lp-home-grouped-->'
STORY_RE = re.compile(r'<article class="news-item[^"]*"[^>]*data-(?:breaking|developing|mainpin|homepin)="1".*?</article>', re.S)


def split_sections(main_inner):
    parts = re.split(r'(?=<section )', main_inner)
    return parts[0], [p for p in parts[1:] if p.strip()]


def kind(sec):
    if sec.startswith('<section class="hero"'):
        return 'hero'
    heads = ' '.join(re.findall(r'<(?:h2|span class="eyebrow")[^>]*>(.*?)</(?:h2|span)>', sec, re.S))
    if re.search(r'condo', heads, re.I):
        return 'condo'
    if re.search(r'class="cta|Facts, not spin|Clear about how we work', sec):
        return 'closing'
    return 'launchpad'


def group_header(eyebrow, title, anchor):
    return (f'<section class="block home-group" id="{anchor}" style="padding-bottom:0"><div class="wrap">'
            f'<span class="eyebrow">{e(eyebrow)}</span><h2>{e(title)}</h2></div></section>\n')


def special_reports_section(data, limit=3):
    reps = sorted([(p, r) for p, rs in group(data) for r in rs], key=lambda x: x[1]['date'], reverse=True)[:limit]
    if not reps:
        return ''
    cards = ''.join(f'<article class="card"><span class="tag">Special Report · {e(p["name"])}</span>'
                    f'<h3 style="margin-top:.6rem"><a href="{e(r["url"])}">{e(r["title"])}</a></h3><p>{e(r["summary"])}</p>'
                    f'<p style="color:var(--text-muted);font-size:.9rem">{fmt_date(r["date"])}</p></article>' for p, r in reps)
    return (f'<section class="block home-group" id="home-special-reports"><div class="wrap"><span class="eyebrow">Special Reports</span>'
            f'<h2>In-depth reports</h2><div class="grid grid-3">{cards}</div>'
            f'<p><a href="/special-reports/">All special reports →</a></p></div></section>\n')


SR_RE = re.compile(r'<section class="block home-group" id="home-special-reports">.*?</section>\n?', re.S)
BRK_BLOCK = re.compile(r'<!--lp-breaking-->(.*?)<!--/lp-breaking-->', re.S)


def refresh(h, data):
    """Already grouped (the builder reuses the live home page and re-injects its breaking block into the first
    news-list, which is the Breaking & Developing group). Re-home stray developing items and refresh Special Reports."""
    a = h.index(DONE) + len(DONE)
    head, body = h[:a], h[a:]
    if 'id="home-breaking"' not in body:
        top = []
        body = BRK_BLOCK.sub(lambda m: (top.append(m.group(1)), '')[1], body)
        body = breaking_section(''.join(top)) + body
    body = SR_RE.sub('', body)
    i = body.index('id="home-breaking"'); j = body.index('</section>', i) + len('</section>')
    stray = []
    tail = STORY_RE.sub(lambda m: (stray.append(m.group(0)), '')[1], body[j:])
    sec = body[:j]
    if stray:
        sec = sec.replace('<!--/lp-breaking-->', ''.join(stray) + '<!--/lp-breaking-->', 1)
    return head + sec + '\n' + special_reports_section(data) + tail.lstrip('\n')


def breaking_section(inner):
    return ('<section class="block home-group" id="home-breaking"><div class="wrap"><span class="eyebrow">Breaking &amp; Developing</span>'
            '<h2>Breaking and developing stories</h2><div class="news-list"><!--lp-breaking-->' + inner +
            '<!--/lp-breaking--></div></div></section>')


def regroup(h, data):
    if DONE in h:
        return refresh(h, data)
    a = h.index('<main id="main">') + len('<main id="main">'); b = h.index('</main>')
    lead, secs = split_sections(h[a:b])
    # Pull breaking/developing/pinned stories out of the news list into their own top group.
    top = []
    def take(m):
        top.append(m.group(0)); return ''
    secs = [BRK_BLOCK.sub(lambda m: (top.append(m.group(1)), '')[1], s) for s in secs]
    for i, s in enumerate(secs):  # developing stories outside the breaking block
        secs[i] = STORY_RE.sub(take, s)
    k = [kind(s) for s in secs]
    out = [lead] + [s for s, t in zip(secs, k) if t == 'hero'] + [DONE]
    out.append(breaking_section(''.join(top)) + '\n')
    out.append(special_reports_section(data))
    out.append(group_header('Launchpad Digital', 'News and features from Launchpad Digital', 'home-launchpad'))
    out += [s for s, t in zip(secs, k) if t == 'launchpad']
    if 'condo' in k:
        out.append(group_header('Florida Condo & HOA Brief', 'From the Florida Condo & HOA Brief', 'home-condo-brief'))
        out += [s for s, t in zip(secs, k) if t == 'condo']
    out += [s for s, t in zip(secs, k) if t == 'closing']
    return h[:a] + ''.join(out) + h[b:]
