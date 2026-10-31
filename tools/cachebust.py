"""Append ?v=<content hash> to local CSS/JS links on every page so CDN (Cloudflare, 4h max-age) never serves stale styles after a change. Idempotent."""
import hashlib, os, re

REF_RE = re.compile(r'((?:href|src)="(/assets/(?:css|js)/[^"?]+\.(?:css|js)))(?:\?v=[0-9a-f]+)?"')


def version(site, path):
    p = os.path.join(site, path.lstrip('/'))
    return hashlib.md5(open(p, 'rb').read()).hexdigest()[:10] if os.path.isfile(p) else None


def apply(h, site, cache):
    def fix(m):
        v = cache.setdefault(m.group(2), version(site, m.group(2)))
        return f'{m.group(1)}?v={v}"' if v else m.group(0)
    return REF_RE.sub(fix, h)


def build(site):
    n, cache = 0, {}
    for root, dirs, files in os.walk(site):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if f.endswith('.html'):
                p = os.path.join(root, f); h = open(p, encoding='utf-8').read(); x = apply(h, site, cache)
                if x != h:
                    open(p, 'w', encoding='utf-8').write(x); n += 1
    return n
