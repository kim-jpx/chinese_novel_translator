#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const { chromium } = require("playwright-extra");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
node tools/scraper/run_range_scrape.js \\
  --url "<booktoki list url>" \\
  --start 1 \\
  --end 10 \\
  --label "지존신의" \\
  --output "지존신의_chapters"

Optional:
  --cdp "http://127.0.0.1:9222"
  --max-pages 8
  --auto false`);
}

function buildUrlWithSpage(rawUrl, spage) {
  const u = new URL(rawUrl);
  u.searchParams.set("spage", String(spage));
  return u.toString();
}

async function discoverEpisodePages(rawUrl, start, end, cdpUrl, maxPages) {
  const found = new Map();
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  for (let spage = 1; spage <= maxPages && found.size < end - start + 1; spage += 1) {
    const url = buildUrlWithSpage(rawUrl, spage);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1200);

    const eps = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a"))
        .map((a) => (a.textContent || "").trim())
        .map((t) => {
          const m = t.match(/\((\d{1,4})\)\s*화/);
          return m ? Number(m[1]) : null;
        })
        .filter((n) => Number.isInteger(n))
    );

    for (const ep of eps) {
      if (ep < start || ep > end) continue;
      if (!found.has(ep)) found.set(ep, spage);
    }
  }

  await browser.close();
  return found;
}

function groupEpisodesByPage(foundEpisodes, start, end) {
  const grouped = new Map();
  for (let ep = start; ep <= end; ep += 1) {
    const spage = foundEpisodes.get(ep);
    if (!spage) continue;
    if (!grouped.has(spage)) grouped.set(spage, []);
    grouped.get(spage).push(ep);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([spage, eps]) => ({ spage, start: Math.min(...eps), end: Math.max(...eps), eps }));
}

function runSingleRange({ listUrl, start, end, label, output, cdpUrl }) {
  const scraperPath = path.join(__dirname, "scrape_gyosul.js");
  const env = {
    ...process.env,
    NOVEL_LIST_URL: listUrl,
    START_EP: String(start),
    END_EP: String(end),
    NOVEL_LABEL: label,
    OUTPUT_SUBDIR: output,
    CDP_URL: cdpUrl,
  };

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scraperPath], { env, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const listUrl = args.url;
  const start = Number(args.start);
  const end = Number(args.end);
  const label = args.label || "novel";
  const output = args.output || `${label}_chapters`;
  const cdpUrl = args.cdp || "http://127.0.0.1:9222";
  const maxPages = Number(args["max-pages"] || 8);
  const auto = (args.auto || "true").toLowerCase() !== "false";

  if (!listUrl || !Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    printUsage();
    process.exit(1);
  }

  if (!auto) {
    const code = await runSingleRange({ listUrl, start, end, label, output, cdpUrl });
    process.exit(code);
  }

  const foundEpisodes = await discoverEpisodePages(listUrl, start, end, cdpUrl, maxPages);
  const batches = groupEpisodesByPage(foundEpisodes, start, end);

  if (batches.length === 0) {
    console.error(`No episodes found in range ${start}~${end} within ${maxPages} pages.`);
    process.exit(1);
  }

  for (const batch of batches) {
    const pageUrl = buildUrlWithSpage(listUrl, batch.spage);
    console.log(
      `\n[auto] spage=${batch.spage} -> episodes ${batch.start}~${batch.end} (${batch.eps.length} items)`
    );
    const code = await runSingleRange({
      listUrl: pageUrl,
      start: batch.start,
      end: batch.end,
      label,
      output,
      cdpUrl,
    });
    if (code !== 0) process.exit(code);
  }

  const missing = [];
  for (let ep = start; ep <= end; ep += 1) {
    if (!foundEpisodes.has(ep)) missing.push(ep);
  }
  if (missing.length > 0) {
    console.warn(`[auto] missing episodes: ${missing.join(", ")}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
