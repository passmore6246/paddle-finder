"""Assemble the public Paddle Finder page (docs/index.html) from the dashboard sources.

The Claude dashboard page (dashboard/index.html + dashboard/charts.js) is the single source.
This wraps it with a small runtime shim (site_src/dash-shim.js), d3 from a CDN, page chrome
and source credits, so it runs as a plain static page on GitHub Pages.

Usage:  py -3 build_site.py
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


page = read("dashboard", "index.html")
charts = read("dashboard", "charts.js")
shim = read("site_src", "dash-shim.js")

page = page.replace('<meta name="dash-one-writer">', "")
page = page.replace('<script src="charts.js"></script>', "<script>\n" + charts + "\n</script>")
assert "charts.js" not in page

credits = """
  <footer class="pf-credits" id="credits">
    <p>Data: <a href="https://pickleballeffect.com/pickleball-paddle-database/" rel="noopener">Pickleball Effect paddle database</a>,
    cross-checked against the <a href="https://www.johnkewpickleball.com/paddle-database" rel="noopener">John Kew paddle database</a>.
    All test data belongs to them; please visit their sites. Paddle photos come from Pickleball Effect and the makers' stores.</p>
    <p>An unofficial, fan-made page. Data updated <span data-updated>…</span>.</p>
  </footer>
"""
# Put the credits inside the main wrapper, after the "How it works" section.
page = page.replace("  </details>\n</div>", "  </details>\n" + credits + "</div>", 1)
assert "pf-credits" in page

head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paddle Finder</title>
<meta name="description" content="Certified pickleball paddles ranked by firepower, power, pop, spin, grit durability and price.">
<meta name="theme-color" content="#1A2233">
<style>
:root{--font-anthropic-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-anthropic-serif:Georgia,"Times New Roman",serif}
html,body{margin:0;background:#1A2233}
body{padding:8px 6px 24px;-webkit-text-size-adjust:100%}
.pf .dash-select{-webkit-appearance:none;appearance:none;padding:0 28px 0 10px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23A9B4C6' stroke-width='1.6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 10px center}
.dash-skeleton{color:transparent!important;background:#33405A;border-radius:4px}
.pf-credits{margin:14px 4px 0;color:#A9B4C6;font-size:11px;line-height:1.5;border-top:1px solid #33405A;padding-top:8px}
.pf-credits a{color:#C6F432}
.pf-credits p{margin:4px 0}
@media (max-width:480px){.pf{border-radius:0;padding:12px 6px}body{padding:0 0 24px}}
</style>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
""" + shim + """
</script>
</head>
<body>
<div id="dash-root">
"""

tail = """
</div>
<script>window.__pfStart();</script>
</body>
</html>
"""

os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
with open(os.path.join(ROOT, "docs", "index.html"), "w", encoding="utf-8", newline="\n") as f:
    f.write(head + page + tail)
# GitHub Pages: serve files as-is.
open(os.path.join(ROOT, "docs", ".nojekyll"), "w").close()
print("wrote docs/index.html", len(head + page + tail), "bytes")
