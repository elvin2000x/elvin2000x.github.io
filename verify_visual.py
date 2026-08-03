#!/usr/bin/env python3
"""verify_visual.py — the rendered half of the polish gate.

verify.js checks the source. This checks what a browser actually draws, which is
where the failures static analysis cannot see live: an image stretched because CSS
set one dimension while the width/height attributes set the other, an element
overflowing the viewport, a tap target smaller than a thumb.

Usage:  python verify_visual.py            (serves the repo, checks every page)
        python verify_visual.py /system/   (one page)

Exits 1 on any FAIL. Skips cleanly (exit 0) if playwright is not installed, so it
can never become a build dependency.
"""
import os, sys, threading, http.server, socketserver, functools

# Windows consoles default to cp1252 and will crash printing a page's own
# characters (stars, arrows). Force UTF-8 and never lose a finding to encoding.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 8799
ASPECT_TOLERANCE = 0.02      # 2% — anything worse is visible to the eye
MIN_TAP = 44                 # house rule
WIDTHS = [375, 1280]

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("visual layer skipped (playwright not installed)")
    sys.exit(0)


def pages():
    """Every page the sitemap advertises, plus the noindex money-path pages."""
    import re
    sm = os.path.join(ROOT, "sitemap.xml")
    urls = []
    if os.path.exists(sm):
        urls = re.findall(r"<loc>https://elvinpeters\.com(.*?)</loc>", open(sm, encoding="utf-8").read())
    for extra in ("/thank-you/",):
        if extra not in urls:
            urls.append(extra)
    return urls


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


CHECK_JS = """() => {
  const out = {aspect: [], overflow: null, taps: []};
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (!img.complete || !img.naturalWidth || r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(img);
    if (cs.objectFit === 'cover' || cs.objectFit === 'contain') continue; // fit handles it
    const natural = img.naturalWidth / img.naturalHeight;
    const drawn = r.width / r.height;
    const off = Math.abs(drawn - natural) / natural;
    if (off > %TOL%) out.aspect.push({
      src: img.getAttribute('src'), natural: +natural.toFixed(3),
      drawn: +drawn.toFixed(3), offPct: +(off * 100).toFixed(1),
      box: Math.round(r.width) + 'x' + Math.round(r.height)
    });
  }
  out.overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth
    ? {scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth} : null;
  const isControl = el => {
    const c = (el.className || '').toString().toLowerCase();
    return el.tagName === 'BUTTON' || el.tagName === 'INPUT' ||
           /(btn|cta|button|nav-cta|themebtn|navburger)/.test(c);
  };
  for (const el of document.querySelectorAll('a[href], button, input[type=submit], input[type=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;   // hidden
    if (!isControl(el)) continue;                 // plain text links are not tap targets
    if (r.height < %TAP% - 0.5 || r.width < 24) out.taps.push({
      what: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40),
      box: Math.round(r.width) + 'x' + Math.round(r.height)
    });
  }
  return out;
}""".replace("%TOL%", str(ASPECT_TOLERANCE)).replace("%TAP%", str(MIN_TAP))


def main():
    only = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("/") else None
    targets = [only] if only else pages()
    httpd = serve()
    fails, warns, checked = [], [], 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for url in targets:
                for w in WIDTHS:
                    page = browser.new_page(viewport={"width": w, "height": 900})
                    errors = []
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    try:
                        page.goto("http://127.0.0.1:%d%s" % (PORT, url), wait_until="networkidle", timeout=20000)
                    except Exception as e:
                        fails.append("%s @%d :: did not load (%s)" % (url, w, str(e)[:60]))
                        page.close(); continue
                    # force lazy images to resolve before measuring
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    page.wait_for_timeout(700)
                    page.evaluate("window.scrollTo(0, 0)")
                    page.wait_for_timeout(250)
                    r = page.evaluate(CHECK_JS)
                    checked += 1
                    for a in r["aspect"]:
                        fails.append("%s @%d :: STRETCHED %s drawn %s (off %.1f%%, natural %.3f vs %.3f)"
                                     % (url, w, a["src"], a["box"], a["offPct"], a["natural"], a["drawn"]))
                    if r["overflow"]:
                        fails.append("%s @%d :: OVERFLOW page scrolls sideways (%dpx in %dpx)"
                                     % (url, w, r["overflow"]["scroll"], r["overflow"]["client"]))
                    for t in r["taps"]:
                        warns.append("%s @%d :: tap target %s '%s'" % (url, w, t["box"], t["what"]))
                    for e in errors:
                        fails.append("%s @%d :: JS ERROR %s" % (url, w, e[:80]))
                    page.close()
            browser.close()
    finally:
        httpd.shutdown()

    for f in fails:
        print("FAIL " + f)
    if warns:
        print("\nWARN (%d) — visible debt, does not block:" % len(warns))
        for w in warns[:25]:
            print("  ~ " + w)
        if len(warns) > 25:
            print("  ... and %d more" % (len(warns) - 25))
    print("\nvisual: %s (%d page-widths checked, %d fails, %d warnings)"
          % ("RED" if fails else "GREEN", checked, len(fails), len(warns)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
