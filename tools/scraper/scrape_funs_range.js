const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-extra");

function parseChapterNumber(text) {
  const m = text.match(/^第([一二三四五六七八九十百千兩0-9]+)章/);
  if (!m) return null;
  return m[1];
}

async function gotoWithRetry(page, url, retries = 3) {
  for (let i = 0; i < retries; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
      await page.waitForTimeout(2000);
    }
  }
}

async function main() {
  const bookUrl = process.env.BOOK_URL || "https://funs.me/book/1717.html";
  const startCh = Number(process.env.START_CH || 1);
  const endCh = Number(process.env.END_CH || 10);
  const label = process.env.NOVEL_LABEL || "至尊神医之帝君要下嫁";
  const outputSubdir = process.env.OUTPUT_SUBDIR || "至尊神医之帝君要下嫁_funs";

  if (!Number.isInteger(startCh) || !Number.isInteger(endCh) || startCh > endCh) {
    throw new Error("Invalid range: set START_CH and END_CH as integers with START_CH <= END_CH");
  }

  const outDir = path.join(process.cwd(), "tools/scraper", outputSubdir);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  await gotoWithRetry(page, bookUrl);
  await page.waitForTimeout(2000);

  const chapterLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a"))
      .map((a) => ({ text: (a.textContent || "").trim(), href: a.href }))
      .filter((x) => x.href.includes("/text/1717/") && x.text.startsWith("第"))
  );

  if (chapterLinks.length === 0) {
    throw new Error("No chapter links found on source page.");
  }

  // Source chapter list is already in reading order.
  const selected = chapterLinks.slice(startCh - 1, endCh);
  const results = [];

  for (let i = 0; i < selected.length; i += 1) {
    const current = selected[i];
    const chapterNo = startCh + i;

    console.log(`scraping ch${chapterNo}: ${current.href}`);
    await gotoWithRetry(page, current.href);
    await page.waitForTimeout(1200);

    const title = await page.title();
    const text = await page.evaluate(() => {
      const body = (document.body?.innerText || "").trim();
      const idx = body.indexOf("第");
      const core = idx >= 0 ? body.slice(idx) : body;
      return core
        .replace(/上一頁[\s\S]*?下一頁/g, "")
        .replace(/手機用戶請瀏覽閱讀[\s\S]*$/m, "")
        .replace(/Copyright[\s\S]*$/m, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    });

    if (!text || text.length < 500) {
      console.log(`skip ch${chapterNo} short text ${text ? text.length : 0}`);
      continue;
    }

    const parsedNo = parseChapterNumber(current.text);
    const file = `${String(chapterNo).padStart(2, "0")}_${chapterNo}화.txt`;
    const content =
      `[ ${label} ${chapterNo}화 ]\n` +
      `원문회차표기: ${parsedNo || current.text}\n` +
      `제목: ${title}\n` +
      `URL : ${current.href}\n\n` +
      `${"─".repeat(60)}\n\n` +
      `${text}`;

    fs.writeFileSync(path.join(outDir, file), content, "utf8");
    results.push({ ch: chapterNo, title, url: current.href, text, parsedNo });
    console.log(`saved ${file} (${text.length} chars)`);
  }

  if (results.length > 0) {
    const merged =
      `${label} ${startCh}화~${endCh}화 합본 (funs)\n` +
      `스크래핑: ${new Date().toLocaleString("ko-KR")}\n\n` +
      results
        .map(
          (r) =>
            `${"═".repeat(60)}\n` +
            ` ${r.ch}화 | ${r.title}\n` +
            ` URL: ${r.url}\n` +
            `${"═".repeat(60)}\n\n` +
            `${r.text}`
        )
        .join("\n\n\n");

    fs.writeFileSync(path.join(outDir, `${label}_${startCh}화~${endCh}화_합본.txt`), merged, "utf8");
  }

  await browser.close();
  console.log(`done. saved ${results.length} chapters -> ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
