/**
 * 소설 챕터 스크래퍼
 *
 * 설치 (최초 1회):
 *   npm install playwright-extra puppeteer-extra-plugin-stealth
 *   npx playwright install chromium
 *
 * 실행:
 *   node tools/scraper/scrape_gyosul.js
 *
 * 기본 결과물: ./tools/scraper/교술_chapters/ 폴더에 화별 .txt + 합본 파일 생성
 *
 * 옵션 실행 예시(지존신의 1~10화):
 *   NOVEL_LIST_URL="https://booktoki469.com/novel/8481927?stx=지존신의&sst=as_update&sod=desc&book=완결소설" \
 *   START_EP=1 END_EP=10 OUTPUT_SUBDIR="지존신의_chapters" NOVEL_LABEL="지존신의" \
 *   node tools/scraper/scrape_gyosul.js
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs   = require('fs');
const path = require('path');

// ── Stealth 플러그인 적용 ──────────────────────────────────────────────────
chromium.use(StealthPlugin());

// ── 설정 ──────────────────────────────────────────────────────────────────
const OUTPUT_SUBDIR = process.env.OUTPUT_SUBDIR || '교술_chapters';
const OUTPUT_DIR = path.join(__dirname, OUTPUT_SUBDIR);
const NOVEL_LABEL = process.env.NOVEL_LABEL || '교술';
const NOVEL_LIST_URL = process.env.NOVEL_LIST_URL || '';
const START_EP = Number(process.env.START_EP || 1);
const END_EP = Number(process.env.END_EP || 5);

// 인덱스 파싱 없이 직접 URL 사용 (이미 파악된 wr_id 값)
const CHAPTERS = [
  { num: 1, url: 'https://booktoki469.com/novel/15577942' },
  { num: 2, url: 'https://booktoki469.com/novel/15577946' },
  { num: 3, url: 'https://booktoki469.com/novel/15577950' },
  { num: 4, url: 'https://booktoki469.com/novel/15577954' },
  { num: 5, url: 'https://booktoki469.com/novel/15577962' },
];

const CF_TIMEOUT_MS = 120_000; // Cloudflare 대기 최대 2분
const CF_POLL_MS    = 2_000;
const PAGE_WAIT_MS  = 2_500;   // 페이지 렌더링 대기

// ── 유틸 ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Cloudflare 통과 대기.
 * 타이틀에 'Just a moment' / '잠시만' 이 없으면 통과로 판단.
 */
async function waitForCloudflare(page) {
  const start = Date.now();
  while (Date.now() - start < CF_TIMEOUT_MS) {
    const title = await page.title().catch(() => '');
    const blocked = title.includes('Just a moment') || title.includes('잠시만');
    if (!blocked) return true;

    // Turnstile 체크박스 자동 클릭 시도
    for (const frame of page.frames()) {
      if (!frame.url().includes('challenges.cloudflare.com')) continue;
      const box = await frame.$('input[type="checkbox"], .cb-lb').catch(() => null);
      if (box) {
        await box.click().catch(() => {});
        console.log('   🖱  Turnstile 체크박스 클릭');
      }
    }

    const remaining = Math.ceil((CF_TIMEOUT_MS - (Date.now() - start)) / 1000);
    console.log(`   ⏳ Cloudflare 대기 중… (${remaining}초 남음)`);
    await sleep(CF_POLL_MS);
  }
  return false; // 타임아웃
}

/**
 * 재시도 포함 페이지 이동.
 * domcontentloaded 사용 — networkidle 은 광고 탓에 타임아웃 발생.
 */
async function goto(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      return;
    } catch (e) {
      console.warn(`   ⚠  goto 실패 (${i + 1}/${retries}): ${e.message.split('\n')[0]}`);
      if (i < retries - 1) await sleep(3_000);
      else throw e;
    }
  }
}

async function ensurePageReady(page, url) {
  await goto(page, url);
  const title0 = await page.title().catch(() => '');
  if (title0.includes('Just a moment') || title0.includes('잠시만')) {
    console.log('   ⚠  Cloudflare 감지됨. 통과 대기…');
    const passed = await waitForCloudflare(page);
    if (!passed) throw new Error('Cloudflare timeout');
    console.log('   ✅ Cloudflare 통과!');
    await goto(page, url);
  }
}

async function discoverChaptersFromList(page, listUrl, startEp, endEp) {
  await ensurePageReady(page, listUrl);
  await sleep(PAGE_WAIT_MS);

  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href*="/novel/"]')]
      .map((a) => ({
        href: a.href,
        text: (a.textContent || '').trim(),
      }))
      .filter((x) => x.text.length > 0);
  });

  const chaptersByEp = new Map();
  for (const item of links) {
    const m = item.text.match(/(?:\((\d{1,4})\)|(?:^|\s)(\d{1,4}))\s*화(?:\s|$)/);
    if (!m) continue;
    const ep = Number(m[1] || m[2]);
    if (!Number.isInteger(ep) || ep < startEp || ep > endEp) continue;
    if (!chaptersByEp.has(ep)) {
      chaptersByEp.set(ep, { num: ep, url: item.href });
    }
  }

  return [...chaptersByEp.values()].sort((a, b) => a.num - b.num);
}

/**
 * 본문 텍스트 추출.
 *
 * 북토끼는 본문을 담는 div의 className을 매 화마다 동적으로 생성한다.
 * 패턴: 소문자 영문 1자 + 16진수 8자 이상  (예: s3ed6cf58f4, z4f70455a26)
 * 이 패턴으로 찾은 div 중 500자 이상인 첫 번째가 본문.
 */
async function extractText(page) {
  // 렌더링 여유 시간
  await sleep(PAGE_WAIT_MS);

  const text = await page.evaluate(() => {
    // 1순위: 북토끼 동적 클래스
    for (const d of document.querySelectorAll('div')) {
      if (!/^[a-z][0-9a-f]{8,}/.test(d.className || '')) continue;
      const t = d.innerText.trim();
      if (t.length > 500) return t;
    }
    // 2순위: 일반 후보 셀렉터
    for (const sel of [
      '#novel-content', '.novel-content', '#rd_body', '.rd_body',
      '.view-content', '#view-content', '.novel_view_text', 'article',
    ]) {
      const el = document.querySelector(sel);
      if (el) { const t = el.innerText.trim(); if (t.length > 500) return t; }
    }
    // 3순위: <p> 태그 모음
    const ps = [...document.querySelectorAll('p')]
      .map(p => p.innerText.trim()).filter(t => t.length > 10).join('\n\n');
    if (ps.length > 500) return ps;

    return document.body.innerText.trim();
  });

  return text;
}

// ── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 기본은 기존 자동화 Chrome(CDP) 연결 시도, 실패 시 일반 launch로 폴백
  const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
  console.log(`🔌 기존 Chrome에 연결 시도: ${CDP_URL}`);
  let browser;
  let context;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
    context = browser.contexts()[0] || await browser.newContext();
    console.log('✅ Chrome 컨텍스트 연결 완료 (CDP)');
  } catch (e) {
    console.warn(`⚠️ CDP 연결 실패, 일반 브라우저로 실행: ${e.message}`);
    browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      viewport: null,
      extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8' },
    });
    console.log('✅ Chrome 컨텍스트 실행 완료 (launch)');
  }

  const existingPages = context.pages();
  const page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
  console.log(`🧭 사용할 탭 준비 완료 (기존 탭 ${existingPages.length}개)`);

  // navigator.webdriver 숨기기 (stealth 플러그인과 이중 보호)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const results = [];

  try {
    const targetChapters = NOVEL_LIST_URL
      ? await discoverChaptersFromList(page, NOVEL_LIST_URL, START_EP, END_EP)
      : CHAPTERS;

    if (targetChapters.length === 0) {
      throw new Error(`타겟 화수(${START_EP}~${END_EP}) 링크를 찾지 못했습니다.`);
    }

    for (const ch of targetChapters) {
      console.log(`\n📖 ${ch.num}화 스크래핑 중… → ${ch.url}`);

      await ensurePageReady(page, ch.url);

      const pageTitle = await page.title();
      console.log(`   제목: ${pageTitle}`);

      const text = await extractText(page);
      console.log(`   본문: ${text.length}자`);

      if (text.length < 300) {
        console.warn(`   ⚠  본문이 너무 짧습니다. 스크린샷 저장 후 건너뜀.`);
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `debug_ch${ch.num}.png`),
          fullPage: true,
        });
        continue;
      }

      results.push({ num: ch.num, title: pageTitle, url: ch.url, text });

      // 화별 파일 저장
      const filename = `${String(ch.num).padStart(2, '0')}_${ch.num}화.txt`;
      const content  =
        `[ ${NOVEL_LABEL} ${ch.num}화 ]\n` +
        `제목: ${pageTitle}\n` +
        `URL : ${ch.url}\n\n` +
        `${'─'.repeat(60)}\n\n` +
        text;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), content, 'utf8');
      console.log(`   ✅ 저장 완료 → ${filename}`);

      await sleep(2_000); // 서버 부하 방지용 딜레이
    }

    // ── 합본 파일 ──────────────────────────────────────────────────────────
    if (results.length > 0) {
      const combined =
        `${NOVEL_LABEL} ${START_EP}화~${END_EP}화 합본\n` +
        `스크래핑: ${new Date().toLocaleString('ko-KR')}\n\n` +
        results.map(r =>
          `${'═'.repeat(60)}\n` +
          `  ${r.num}화  |  ${r.title}\n` +
          `  URL: ${r.url}\n` +
          `${'═'.repeat(60)}\n\n` +
          r.text
        ).join('\n\n\n');

      fs.writeFileSync(
        path.join(OUTPUT_DIR, `${NOVEL_LABEL}_${START_EP}화~${END_EP}화_합본.txt`),
        combined,
        'utf8'
      );
      console.log(`\n📄 합본 저장 완료 → ${NOVEL_LABEL}_${START_EP}화~${END_EP}화_합본.txt`);
    }

    console.log(`\n✅ 완료! 총 ${results.length}개 화 저장됨.`);
    console.log(`📁 저장 경로: ${OUTPUT_DIR}`);

  } catch (err) {
    console.error('\n💥 오류:', err.message);
    try {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, 'error_screenshot.png'),
        fullPage: true,
      });
      console.log('   오류 스크린샷 저장됨 → error_screenshot.png');
    } catch {}
  } finally {
    await browser.close();
  }
}

main();
