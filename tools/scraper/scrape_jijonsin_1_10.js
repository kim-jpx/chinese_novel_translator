const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

chromium.use(StealthPlugin());

const NOVEL_URL =
  "https://booktoki469.com/novel/8481927?stx=%EC%A7%80%EC%A1%B4%EC%8B%A0%EC%9D%98&sst=as_update&sod=desc&book=%EC%99%84%EA%B2%B0%EC%86%8C%EC%84%A4";
const OUTPUT_DIR = path.join(__dirname, "지존신의_chapters");
const CF_TIMEOUT_MS = 120000;
const CF_POLL_MS = 2000;
const PAGE_WAIT_MS = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForCloudflare(page) {
  const start = Date.now();
  while (Date.now() - start < CF_TIMEOUT_MS) {
    const title = await page.title().catch(() => "");
    const blocked = title.includes("Just a moment") || title.includes("잠시만");
    if (!blocked) return true;

    for (const frame of page.frames()) {
      if (!frame.url().includes("challenges.cloudflare.com")) continue;
      const box = await frame.$("input[type='checkbox'], .cb-lb").catch(() => null);
      if (box) await box.click().catch(() => {});
    }
    await sleep(CF_POLL_MS);
  }
  return false;
}

async function goto(page, url, retries = 3) {
  for (let i = 0; i < retries; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(3000);
    }
  }
}

async function ensurePageReady(page, url) {
  await goto(page, url);
  const title = await page.title().catch(() => "");
  if (title.includes("Just a moment") || title.includes("잠시만")) {
    const passed = await waitForCloudflare(page);
    if (!passed) throw new Error("Cloudflare timeout");
    await goto(page, url);
  }
}

async function getChapterTargets(page) {
  await ensurePageReady(page, NOVEL_URL);
  await sleep(PAGE_WAIT_MS);

  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href*='/novel/']"));
    return anchors
      .map((a) => ({
        href: a.href,
        text: (a.textContent || "").trim(),
      }))
      .filter((x) => x.text.length > 0);
  });

  const byEpisode = new Map();
  for (const item of links) {
    const m = item.text.match(/(?:^|\s)(\d{1,4})\s*화(?:\s|$)/);
    if (!m) continue;
    const ep = Number(m[1]);
    if (!Number.isInteger(ep) || ep < 1 || ep > 10) continue;
    if (!item.href.includes("/novel/")) continue;
    if (!byEpisode.has(ep)) {
      byEpisode.set(ep, {
        num: ep,
        url: item.href,
        text: item.text,
      });
    }
  }

  return Array.from(byEpisode.values()).sort((a, b) => a.num - b.num);
}

async function extractText(page) {
  await sleep(PAGE_WAIT_MS);
  return page.evaluate(() => {
    for (const d of document.querySelectorAll("div")) {
      if (!/^[a-z][0-9a-f]{8,}/.test(d.className || "")) continue;
      const t = d.innerText.trim();
      if (t.length > 500) return t;
    }
    for (const sel of [
      "#novel-content",
      ".novel-content",
      "#rd_body",
      ".rd_body",
      ".view-content",
      "#view-content",
      ".novel_view_text",
      "article",
    ]) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.innerText.trim();
        if (t.length > 500) return t;
      }
    }
    const ps = Array.from(document.querySelectorAll("p"))
      .map((p) => p.innerText.trim())
      .filter((t) => t.length > 10)
      .join("\n\n");
    if (ps.length > 500) return ps;
    return document.body.innerText.trim();
  });
}

async function connectBrowser() {
  const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
  try {
    const browser = await chromium.connectOverCDP(cdp);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    return { browser, context, page, mode: "cdp" };
  } catch {
    const browser = await chromium.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "ko-KR",
      viewport: null,
      extraHTTPHeaders: { "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8" },
    });
    const page = await context.newPage();
    return { browser, context, page, mode: "launch" };
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const { browser, context, page, mode } = await connectBrowser();
  console.log(`브라우저 모드: ${mode}`);

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const results = [];
  try {
    const chapters = await getChapterTargets(page);
    if (chapters.length === 0) {
      throw new Error("1~10화 링크를 찾지 못했습니다.");
    }
    console.log(`발견 챕터 수(1~10화): ${chapters.length}`);

    for (const ch of chapters) {
      console.log(`\n[${ch.num}화] ${ch.url}`);
      await ensurePageReady(page, ch.url);
      const title = await page.title().catch(() => `${ch.num}화`);
      const text = await extractText(page);
      console.log(`본문 길이: ${text.length}`);

      if (text.length < 300) {
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `debug_ch${ch.num}.png`),
          fullPage: true,
        });
        console.log(`짧은 본문으로 스킵: ${ch.num}화`);
        continue;
      }

      const filename = `${String(ch.num).padStart(2, "0")}_${ch.num}화.txt`;
      const content =
        `[ 지존신의 ${ch.num}화 ]\n` +
        `제목: ${title}\n` +
        `URL : ${ch.url}\n\n` +
        `${"─".repeat(60)}\n\n` +
        text;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), content, "utf8");
      results.push({ num: ch.num, title, url: ch.url, text });
      await sleep(2000);
    }

    if (results.length > 0) {
      const combined =
        `지존신의 1화~10화 합본\n` +
        `스크래핑: ${new Date().toLocaleString("ko-KR")}\n\n` +
        results
          .map(
            (r) =>
              `${"═".repeat(60)}\n` +
              `  ${r.num}화  |  ${r.title}\n` +
              `  URL: ${r.url}\n` +
              `${"═".repeat(60)}\n\n` +
              r.text
          )
          .join("\n\n\n");
      fs.writeFileSync(path.join(OUTPUT_DIR, "지존신의_1화~10화_합본.txt"), combined, "utf8");
    }

    console.log(`\n완료: ${results.length}개 화 저장`);
    console.log(`저장 경로: ${OUTPUT_DIR}`);
  } catch (err) {
    console.error(`오류: ${err.message}`);
    try {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "error_screenshot.png"),
        fullPage: true,
      });
    } catch {}
  } finally {
    await browser.close();
  }
}

main();
