#!/usr/bin/env node
/**
 * 69shuba 챕터 스크래퍼
 *
 * 실행 예시:
 *   node tools/scraper/scrape_69shuba_range.js \
 *     --book 31970 \
 *     --start 21 \
 *     --end 30 \
 *     --label "逆天神妃至上" \
 *     --output "逆天神妃至上_69shuba"
 */

const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

chromium.use(StealthPlugin());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) { args[key] = true; continue; }
    args[key] = val;
    i++;
  }
  return args;
}

async function getChapterList(page, bookId, start, end) {
  const listUrl = `https://www.69shuba.com/book/${bookId}/`;
  console.log(`📋 챕터 목록 로드: ${listUrl}`);
  await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2000);

  const links = await page.evaluate(({ s, e }) => {
    const anchors = Array.from(document.querySelectorAll(".catalog_list a, .chapter_list a, ul.list a, .mulu a"));
    return anchors
      .map((a, i) => ({ num: i + 1, href: a.href, text: (a.textContent || "").trim() }))
      .filter((c) => c.num >= s && c.num <= e);
  }, { s: start, e: end });

  if (links.length === 0) {
    // fallback: 모든 a 태그에서 /txt/{bookId}/ 패턴 찾기
    const allLinks = await page.evaluate(({ bid }) => {
      return Array.from(document.querySelectorAll("a"))
        .filter((a) => a.href && a.href.includes(`/txt/${bid}/`))
        .map((a) => ({ href: a.href, text: (a.textContent || "").trim() }));
    }, { bid: bookId });
    return allLinks.slice(start - 1, end);
  }
  return links;
}

async function scrapeChapter(page, url, label, chapterNum) {
  console.log(`  → ${chapterNum}화 로드: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1500);

  const result = await page.evaluate(() => {
    const titleEl = document.querySelector("h1, .chapter_title, .title");
    const title = titleEl ? titleEl.textContent.trim() : "";

    // 본문 컨테이너 찾기
    const contentEl =
      document.querySelector(".txtnav") ||
      document.querySelector(".content") ||
      document.querySelector("#content") ||
      document.querySelector(".chapter_content");

    if (!contentEl) return { title, content: "" };

    // 광고·불필요한 요소 제거
    const cloned = contentEl.cloneNode(true);
    cloned.querySelectorAll("script, style, .ad, .ads, .adsbygoogle").forEach((el) => el.remove());

    const text = cloned.innerText || cloned.textContent || "";
    return { title, content: text.trim() };
  });

  return { ...result, url };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bookId = args["book"] || "31970";
  const start = parseInt(args["start"] || "21", 10);
  const end = parseInt(args["end"] || "30", 10);
  const label = args["label"] || "逆天神妃至上";
  const outputSubdir = args["output"] || `${label}_69shuba`;

  const outputDir = path.join(__dirname, outputSubdir);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "zh-CN",
  });
  const page = await context.newPage();

  let chapters = await getChapterList(page, bookId, start, end);
  console.log(`✅ 챕터 목록 ${chapters.length}개 발견`);

  if (chapters.length === 0) {
    console.error("❌ 챕터 목록을 찾지 못했습니다. 사이트 구조를 확인하세요.");
    await browser.close();
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < chapters.length; i++) {
    const chNum = start + i;
    const ch = chapters[i];
    const url = ch.href || ch.url;

    try {
      const data = await scrapeChapter(page, url, label, chNum);
      results.push({ num: chNum, ...data });

      const numStr = String(chNum).padStart(2, "0");
      const filename = `${numStr}_${chNum}화.txt`;
      const filepath = path.join(outputDir, filename);
      const fileContent = [
        `[ ${label} ${chNum}화 ]`,
        `제목: ${data.title}`,
        `URL : ${url}`,
        ``,
        `────────────────────────────────────────────────────────────`,
        ``,
        data.content,
      ].join("\n");

      fs.writeFileSync(filepath, fileContent, "utf8");
      console.log(`  ✅ 저장: ${filename} (${data.content.length}자)`);
    } catch (err) {
      console.error(`  ❌ ${chNum}화 실패:`, err.message);
    }

    if (i < chapters.length - 1) await sleep(1500);
  }

  // 합본 생성
  if (results.length > 0) {
    const mergedName = `${label}_${start}화~${end}화_합본.txt`;
    const mergedPath = path.join(outputDir, mergedName);
    const merged = results
      .map((r) => [
        `${"=".repeat(60)}`,
        `[ ${label} ${r.num}화 ]  ${r.title}`,
        `${"=".repeat(60)}`,
        ``,
        r.content,
        ``,
      ].join("\n"))
      .join("\n");
    fs.writeFileSync(mergedPath, merged, "utf8");
    console.log(`\n📦 합본 저장: ${mergedName}`);
  }

  await browser.close();
  console.log(`\n🎉 완료: ${results.length}/${end - start + 1}화 스크랩`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
