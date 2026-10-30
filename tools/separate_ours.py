"""Keep Launchpad's own stories out of the 'What's happening around Florida' (other outlets) block.
Moves the <!--lp-ours--> block into its own 'From Launchpad' section placed just before. Idempotent."""
import re

OURS_RE = re.compile(r'<!--lp-ours-->.*?<!--/lp-ours-->', re.S)
OURS_HEAD_RE = re.compile(r'<h3 class="lp-grp"[^>]*>From Launchpad: our own reporting</h3>')
OLD_ASOF = 'Launchpad stories come first; headlines from other Florida outlets follow, each marked and linked to the original reporting.'
NEW_ASOF = 'Headlines from other Florida outlets, each credited and linked to the original reporting.'


def ours_section(block):
    return ('<section class="block lp-ours-sec" id="from-launchpad"><div class="wrap"><span class="eyebrow">Launchpad Digital</span>'
            '<h2>From Launchpad: our own reporting</h2><div class="news-list">' + block +
            '</div><p><a href="/news/">All Launchpad stories →</a></p></div></section>\n')


def separate(h):
    h = h.replace(OLD_ASOF, NEW_ASOF)
    if 'id="from-launchpad"' in h:
        return OURS_HEAD_RE.sub('', h)
    m = OURS_RE.search(h)
    if not m or '<!--lp-live-->' not in h:
        return h
    s = h.rfind('<section', 0, m.start())
    if '<!--lp-live-->' not in h[s:h.find('</section>', m.end())]:
        return h  # already in a different section
    block = OURS_HEAD_RE.sub('', m.group(0))
    h = h[:m.start()] + h[m.end():]
    return h[:s] + ours_section(block) + h[s:]
