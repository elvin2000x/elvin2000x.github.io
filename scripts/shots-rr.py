"""Screenshots of the Revenue Recovery page at phone and desktop widths (Mission Control #651).
Serves this worktree on a local port, loads /revenue-recovery/ and /fix (redirect), writes PNGs
to the folder given as argv[1], prints console errors and the final URL after the /fix redirect."""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "shots-rr")
os.makedirs(OUT, exist_ok=True)
PORT = 8137

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

handler = functools.partial(Quiet, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{PORT}"

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h in (("phone", 375, 812), ("desktop", 1280, 900)):
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "/revenue-recovery/", wait_until="networkidle")
        pg.wait_for_timeout(400)
        sw = pg.evaluate("document.documentElement.scrollWidth")
        print(f"{name}: scrollWidth={sw} viewport={w} sideways={'YES' if sw > w else 'no'}")
        pg.screenshot(path=os.path.join(OUT, f"rr-{name}-top.png"), full_page=False)
        pg.screenshot(path=os.path.join(OUT, f"rr-{name}-full.png"), full_page=True)
        print(f"{name}: console errors:", [e for e in errs if "googletagmanager" not in e and "facebook" not in e and "connect.facebook" not in e] or "none")
        pg.close()
    pg = b.new_page()
    pg.goto(base + "/fix?utm_source=poster&utm_medium=qr&utm_campaign=revenue-recovery-toronto", wait_until="networkidle")
    pg.wait_for_timeout(300)
    print("after /fix:", pg.url)
    b.close()
srv.shutdown()
print("shots in", OUT)
