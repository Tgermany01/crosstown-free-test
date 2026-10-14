# Design reference (captured from the live Wix site, 2026-10-14)

- `screenshots/<page>-1440.png`, `<page>-390.png`: full-page captures of every sitemap URL at desktop and phone widths.
- `styles.json`: computed styles from the home page at 1440 (h1-h4, p, links, buttons, header/nav, footer, top-level sections), plus `fontFaces`, `fontLinks`, `usedFamilies`, and the Wix theme custom properties (`customProperties` / `customPropertiesResolved`, Wix names them `--wst-color-*` and `--wst-font-style-*`).
- `content/*.md` and `content/images/`: output of `npm run scrape` (scraped/ is gitignored).
- `content/rendered-text/*.txt`: the visible text of each page after JavaScript runs. Use these for outreach, blog and category pages, where the HTML scrape found no text blocks.

Theme at a glance: headings in Vollkorn Italic, body in Lora; navy #001F3D (text and dark sections), teal #045174, light blue #83A7C9 (accent and buttons), orange #E87A00 (donate/CTA buttons), white backgrounds.
