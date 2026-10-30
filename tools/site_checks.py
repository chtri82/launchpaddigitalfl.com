"""Static checks for the built site: internal links, nav presence, readable text colors."""
import os, re
from urllib.parse import urlparse, unquote

SKIP_PREFIX = ('/cdn-cgi/',)


def is_redirect(h):
    return 'http-equiv="refresh"' in h


def internal_links(h):
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)  # ignore commented-out templates
    for m in re.finditer(r'''(?:href|src)="([^"#?]*)(?:[?#][^"]*)?"''', h):
        u = m.group(1)
        if not u or u.startswith(('mailto:', 'tel:', 'javascript:', 'data:')):
            continue
        p = urlparse(u)
        if p.scheme in ('http', 'https') and p.netloc not in ('launchpaddigitalfl.com', 'www.launchpaddigitalfl.com'):
            continue
        yield unquote(p.path)


def resolve(site, page_rel, path):
    if not path.startswith('/'):
        path = os.path.normpath(os.path.join('/' + os.path.dirname(page_rel), path))
    if path.startswith(SKIP_PREFIX):
        return True
    f = os.path.join(site, path.lstrip('/'))
    return os.path.isfile(f) or os.path.isfile(os.path.join(f, 'index.html'))


def hex_rgb(c):
    c = c.lstrip('#')
    if len(c) == 3: c = ''.join(x * 2 for x in c)
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))


def luminance(c):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, hex_rgb(c)); return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True); return (la + 0.05) / (lb + 0.05)


def css_vars(css):
    """Return (light_vars, dark_vars) from :root and the prefers-color-scheme:dark :root block."""
    light = dict(re.findall(r'--([\w-]+):\s*(#[0-9A-Fa-f]{3,6})', re.search(r':root\{(.*?)\}', css, re.S).group(1)))
    dm = re.search(r'@media \(prefers-color-scheme:dark\)\{\s*:root\{(.*?)\}', css, re.S)
    dark = dict(light); dark.update(re.findall(r'--([\w-]+):\s*(#[0-9A-Fa-f]{3,6})', dm.group(1)) if dm else [])
    return light, dark


# Hard-coded mid/dark grays that vanish on the dark-mode background unless overridden in CSS.
DARK_ONLY_GRAYS = re.compile(r'style="[^"]*(?<![-\w])color:\s*#(?:333|444|555|666|777)\b', re.I)
