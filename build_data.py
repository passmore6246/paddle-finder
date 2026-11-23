"""Build paddles.json for the Paddle Finder dashboard.

Primary source: Pickleball Effect paddle database (public Google Sheet).
Cross-check:    John Kew paddle database (published Google Sheet CSV).

Usage:  py -3 build_data.py <output_dir>
Writes <output_dir>/paddles.json as {"rows": [...], "meta": [...]}.

Thumbnails: each paddle gets a small WebP image (data: URL) taken from its Pickleball
Effect paddle page when one exists, else from the og:image of its store link. Results are
cached in <output_dir>/thumbs.json so a daily run only fetches new paddles; misses are
retried after 14 days. Needs Pillow (pip install pillow); without it thumbnails are skipped.
"""
import base64
import csv
import difflib
import html
import io
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

try:
    from PIL import Image
except ImportError:  # thumbnails are optional
    Image = None

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
THUMB_PX = 72
RETRY_DAYS = 14

PE_URL = "https://docs.google.com/spreadsheets/d/1CsQN9lFJge-QHjBdXE77stTxZHO90RmvXia20YG_JzA/export?format=csv"
JK_URL = ("https://docs.google.com/spreadsheets/d/e/2PACX-1vSxXXe0qvh94nPoU20S7OSp8yw9tHF4f4VpfNH_fneBhKSSOxvvrQ9lPGwgcNa_OS9OuWTZzaDyZWiZ"
          "/pub?gid=575894669&single=true&output=csv")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 PaddleFinder"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8-sig")


def rows_of(text):
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    out = []
    for cells in reader:
        d = {}
        for i, h in enumerate(header):
            h = h.strip()
            if h and h not in d:
                d[h] = cells[i].strip() if i < len(cells) else ""
        out.append(d)
    return out


def num(s):
    if s is None:
        return None
    s = str(s).replace("$", "").replace(",", "").replace("%", "").strip()
    try:
        v = float(s)
    except ValueError:
        return None
    return v if v == v else None  # drop NaN


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def tier(s):
    m = re.search(r"(\d)", s or "")
    return int(m.group(1)) if m else None


def pct_ranks(values):
    """Percentile rank (0-100) of each value within the non-null values."""
    vals = sorted(v for v in values if v is not None)
    n = len(vals)
    out = []
    for v in values:
        if v is None or n < 2:
            out.append(None)
            continue
        below = sum(1 for x in vals if x < v)
        equal = sum(1 for x in vals if x == v)
        out.append(round(100 * (below + 0.5 * (equal - 1)) / (n - 1)))
    return out


def get_bytes(url, limit=6_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read(limit)


def pe_page_images():
    """Featured image URL per normalized 'brand name' title from Pickleball Effect paddle pages."""
    out, page = {}, 1
    while page <= 20:
        url = f"https://pickleballeffect.com/wp-json/wp/v2/paddles?per_page=100&page={page}&_embed=wp:featuredmedia"
        try:
            items = json.loads(get_bytes(url).decode("utf-8"))
        except Exception:
            break
        if not isinstance(items, list) or not items:
            break
        for it in items:
            title = html.unescape(it.get("title", {}).get("rendered", ""))
            media = (it.get("_embedded", {}).get("wp:featuredmedia") or [{}])[0]
            sizes = media.get("media_details", {}).get("sizes", {})
            src = (sizes.get("thumbnail") or sizes.get("medium") or {}).get("source_url") or media.get("source_url")
            if title and src:
                out[norm(title)] = src
        if len(items) < 100:
            break
        page += 1
    return out


OG_RE = [
    re.compile(r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]*content=["\']([^"\']+)', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']og:image', re.I),
]


def store_image(link):
    page = get_bytes(link, 600_000).decode("utf-8", "ignore")
    for rx in OG_RE:
        m = rx.search(page)
        if m:
            src = html.unescape(m.group(1))
            if src.startswith("//"):
                src = "https:" + src
            src = re.sub(r"^http://", "https://", src)
            if "/cdn/shop/" in src:  # Shopify CDN can resize on request
                src = re.sub(r"([?&])width=\d+", r"\1", src)
                src += ("&" if "?" in src else "?") + "width=200"
            return src
    return None


def make_thumb(src):
    im = Image.open(io.BytesIO(get_bytes(src)))
    im.draft("RGB", (THUMB_PX * 2, THUMB_PX * 2))
    im = im.convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((THUMB_PX, THUMB_PX))
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.getchannel("A"))
    buf = io.BytesIO()
    bg.save(buf, "WEBP", quality=60, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def thumbnails(pe_rows, out_dir):
    """Return {paddle id: data URL or None}, using and updating the cache."""
    if Image is None:
        print("Pillow not installed: skipping thumbnails")
        return {}
    path = os.path.join(out_dir, "thumbs.json")
    try:
        cache = json.load(open(path, encoding="utf-8"))
    except Exception:
        cache = {}
    now = datetime.now(timezone.utc)
    todo = []
    for pid, brand, name, link in pe_rows:
        c = cache.get(pid)
        if c and (c.get("src") or now - datetime.fromisoformat(c["tried"]) < timedelta(days=RETRY_DAYS)):
            continue
        todo.append((pid, brand, name, link))
    pe_imgs = pe_page_images() if todo else {}

    def work(item):
        pid, brand, name, link = item
        srcs = []
        k = norm(brand + name)
        if k in pe_imgs:
            srcs.append(pe_imgs[k])
        if link and link.startswith("http"):
            try:
                s = store_image(link)
                if s:
                    srcs.append(s)
            except Exception:
                pass
        for s in srcs:
            try:
                return pid, make_thumb(s), s
            except Exception:
                continue
        return pid, None, None

    with ThreadPoolExecutor(max_workers=8) as ex:
        for pid, data, src in ex.map(work, todo):
            cache[pid] = {"src": data, "from": src, "tried": now.isoformat()}
    os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f)
    print(f"thumbnails: fetched {len(todo)}, have {sum(1 for v in cache.values() if v.get('src'))}")
    return {k: v.get("src") for k, v in cache.items()}


def main(out_dir):
    pe = [r for r in rows_of(fetch(PE_URL)) if r.get("Brand") and r.get("Paddle Name")]
    jk = [r for r in rows_of(fetch(JK_URL)) if r.get("Company") and r.get("Paddle")]

    # John Kew percentile ranks within its own database, so they compare with Pickleball Effect percentiles.
    jk_power = pct_ranks([num(r.get("Serve Speed-MPH (Power)")) for r in jk])
    jk_pop = pct_ranks([num(r.get("Punch Volley Speed-MPH (Pop)")) for r in jk])
    jk_spin = pct_ranks([num(r.get("Spin RPM")) for r in jk])
    jk_fire = pct_ranks([num(r.get("Firepower (0-100)")) for r in jk])
    by_brand = {}
    for i, r in enumerate(jk):
        by_brand.setdefault(norm(r["Company"]), []).append(i)

    def find_jk(brand, name):
        cands = by_brand.get(norm(brand), [])
        key = norm(name)
        for i in cands:
            if norm(jk[i]["Paddle"]) == key:
                return i, "exact"
        best, best_score = None, 0.0
        for i in cands:
            s = difflib.SequenceMatcher(None, key, norm(jk[i]["Paddle"])).ratio()
            if s > best_score:
                best, best_score = i, s
        if best is not None and best_score >= 0.9:
            return best, "close"
        return None, None

    # Pickleball Effect spin percentile (sheet gives RPM and a rating, not a percentile).
    pe_spin_pct = pct_ranks([num(r.get("Spin (RPM)")) for r in pe])

    rows = []
    seen = set()
    for idx, r in enumerate(pe):
        brand, name = r["Brand"], r["Paddle Name"]
        pid = f"{brand} | {name}"
        if pid in seen:
            pid = f"{pid} ({idx})"
        seen.add(pid)
        approval = r.get("Approval Body", "")
        certified = bool(approval) and "unapproved" not in approval.lower()
        row = {
            "id": pid,
            "brand": brand,
            "name": name,
            "price": num(r.get("Price")),
            "code": r.get("Discount Code") or None,
            "link": r.get("Link to Paddle") or None,
            "year": r.get("Year Released") or None,
            "approval": approval or None,
            "certified": "Yes" if certified else "No",
            "shape": (r.get("Shape") or "").strip().capitalize() or None,
            "type": r.get("Paddle Type") or None,
            "build": r.get("Build Style") or None,
            "feel": r.get("Impact Feel") or None,
            "grit": r.get("Grit Type") or None,
            "durability": tier(r.get("Spin Durability")),
            "core": num(r.get("Core Thickness (mm)")),
            "weight": num(r.get("Weight (oz)")),
            "swing": num(r.get("Swing Weight")),
            "twist": num(r.get("Twist Weight")),
            "spin": num(r.get("Spin (RPM)")),
            "spinPct": pe_spin_pct[idx],
            "spinRating": r.get("Spin Rating") or None,
            "power": num(r.get("Power (MPH)")),
            "powerPct": num(r.get("Power Percentile")),
            "pop": num(r.get("Pop (MPH)")),
            "popPct": num(r.get("Pop Percentile")),
            "firePct": num(r.get("Firepower Percentile")),
        }
        j, how = find_jk(brand, name)
        if j is not None:
            k = jk[j]
            row.update({
                "jkMatch": how,
                "jkName": f'{k["Company"]} {k["Paddle"]}',
                "jkPowerPct": jk_power[j],
                "jkPopPct": jk_pop[j],
                "jkSpinPct": jk_spin[j],
                "jkFirePct": jk_fire[j],
                "jkSpin": num(k.get("Spin RPM")),
                "jkFirepower": num(k.get("Firepower (0-100)")),
                "jkCert": k.get("Certification Status") or None,
                "jkDurability": tier(k.get("Spin Durability Tier")),
                "jkPrice": num(k.get("Retail Price")),
            })
        else:
            row.update({k: None for k in ["jkMatch", "jkName", "jkPowerPct", "jkPopPct", "jkSpinPct", "jkFirePct",
                                          "jkSpin", "jkFirepower", "jkCert", "jkDurability", "jkPrice"]})
        rows.append(row)

    thumbs = thumbnails([(r["id"], r["brand"], r["name"], r["link"]) for r in rows], out_dir)
    for r in rows:
        r["img"] = thumbs.get(r["id"])

    with open(os.path.abspath(__file__), encoding="utf-8") as f:
        code = f.read()
    meta = [
        {"label": "build_data.py", "value": code, "type": "code", "lang": "python"},
        {"label": "Primary input", "value": "Pickleball Effect Paddle Database (Google Sheet)"},
        {"label": "Cross-check input", "value": "John Kew Paddle Database (published Google Sheet)"},
        {"label": "Built", "value": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")},
        {"label": "Counts", "value": f"{len(pe)} Pickleball Effect rows, {len(jk)} John Kew rows, "
                                     f"{sum(1 for r in rows if r['jkMatch'])} matched, "
                                     f"{sum(1 for r in rows if r['img'])} with photos"},
    ]
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "paddles.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "meta": meta}, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(out, len(rows), "rows,", sum(1 for r in rows if r["jkMatch"]), "matched to John Kew")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
