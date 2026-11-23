# Paddle Finder

A phone-friendly, unofficial page that ranks USAP/UPA-A certified pickleball paddles by
firepower, power, pop, spin, grit durability and price.

- **Live page:** served from `docs/` by GitHub Pages.
- **Data:** the [Pickleball Effect paddle database](https://pickleballeffect.com/pickleball-paddle-database/),
  cross-checked against the [John Kew paddle database](https://www.johnkewpickleball.com/paddle-database).
  All test data belongs to them.
- **Daily refresh:** `.github/workflows/refresh.yml` runs `build_data.py` (downloads both sheets, merges them,
  adds small paddle photos cached in `data/thumbs.json`) and `build_site.py` (assembles `docs/index.html`
  from `dashboard/`).

To rebuild locally: `py -3 build_data.py data`, copy `data/paddles.json` to `docs/`, then `py -3 build_site.py`.
