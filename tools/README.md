# Tools Directory

This directory contains non-runtime utility scripts and related documentation.

## Contents

- `scraper/`
  - `scrape_gyosul.js`: Scrapes selected chapter text into local files.
  - `run_range_scrape.js`: Range-based CLI wrapper (`url/start/end/label/output`).
  - `SCRAPER_README.md`: Detailed runbook and troubleshooting for scraper usage.
  - `교술_chapters/`: Scraper output and temporary debug artifacts.

## Usage

From project root:

```bash
npm run scraper:gyosul
```

Or directly:

```bash
node tools/scraper/scrape_gyosul.js
```

Range scraping (recommended mini-program):

```bash
npm run scraper:range -- \
  --url "https://booktoki469.com/novel/8481927?stx=지존신의&sst=as_update&sod=desc&book=완결소설&spage=2" \
  --start 1 \
  --end 10 \
  --label "지존신의" \
  --output "지존신의_chapters"
```

Notes:
- `spage` is now auto-discovered by default; you can pass a base list URL without tuning page manually.
- Tune discovery depth with `--max-pages` (default: `8`).
- Disable auto discovery with `--auto false`.
