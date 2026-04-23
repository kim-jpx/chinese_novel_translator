const fs = require("fs");
const path = require("path");

const BOOK_ID = process.env.BOOK_ID || "9015656";
const FIRST_CID = Number(process.env.FIRST_CID || 2199165);
const START_CH = Number(process.env.START_CH || 1);
const END_CH = Number(process.env.END_CH || 10);
const NOVEL_LABEL = process.env.NOVEL_LABEL || "至尊神医之帝君要下嫁";
const OUTPUT_SUBDIR = process.env.OUTPUT_SUBDIR || "至尊神医之帝君要下嫁_shuqi";
const READER_BASE_URL = process.env.READER_BASE_URL || "https://www.shuqi.com/reader";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function validateRange(startCh, endCh) {
  if (!Number.isInteger(startCh) || !Number.isInteger(endCh) || startCh > endCh) {
    throw new Error("Invalid range: set START_CH and END_CH as integers with START_CH <= END_CH");
  }
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractPageData(html, className) {
  const pattern = new RegExp(`<i class="page-data ${className}">([\\s\\S]*?)<\\/i>`);
  const match = html.match(pattern);
  if (!match) {
    throw new Error(`Could not find page data for ${className}`);
  }

  return JSON.parse(decodeHtmlEntities(match[1]));
}

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : `${NOVEL_LABEL}-书旗网`;
}

function flattenChapters(chaptersInfo) {
  const volumeList = chaptersInfo.chapterList || [];
  return volumeList.flatMap((volume) => volume.volumeList || []);
}

function rotateLetters(value) {
  return value
    .split("")
    .map((char) => {
      if (!/[A-Za-z]/.test(char)) return char;

      const bucket = Math.floor(char.charCodeAt(0) / 97);
      const shifted = (char.toLowerCase().charCodeAt(0) - 83) % 26 || 26;
      return String.fromCharCode(shifted + (bucket === 0 ? 64 : 96));
    })
    .join("");
}

function decodeChapterContent(encoded) {
  const cleaned = rotateLetters(encoded).replace(/[^A-Za-z0-9+/=]/g, "");
  return Buffer.from(cleaned, "base64").toString("utf8");
}

function normalizeChapterText(decodedHtml) {
  return decodedHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/^\u3000+/, "").trimEnd())
    .filter((line) => line.length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8",
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function buildContentUrl(chaptersInfo, chapter) {
  if (chapter.isFreeRead) {
    return chaptersInfo.freeContUrlPrefix + decodeHtmlEntities(chapter.contUrlSuffix);
  }

  if (chapter.isBuy) {
    return chaptersInfo.chargeContUrlPrefix + decodeHtmlEntities(chapter.contUrlSuffix);
  }

  return chaptersInfo.shortContUrlPrefix + decodeHtmlEntities(chapter.shortContUrlSuffix);
}

function buildReaderUrl(cid) {
  return `${READER_BASE_URL}?bid=${BOOK_ID}&cid=${cid}`;
}

async function scrapeChapter(ch) {
  const cid = FIRST_CID + ch - 1;
  const url = buildReaderUrl(cid);

  console.log(`scraping ch${ch}: ${url}`);
  const readerHtml = await fetchText(url);
  const title = extractTitle(readerHtml);
  const chaptersInfo = extractPageData(readerHtml, "js-dataChapters");
  const chapter = flattenChapters(chaptersInfo).find(
    (item) => String(item.chapterId) === String(cid)
  );

  if (!chapter) {
    throw new Error(`Could not find chapter metadata for cid=${cid}`);
  }

  const contentUrl = buildContentUrl(chaptersInfo, chapter);
  const payload = await fetchJson(contentUrl);
  if (String(payload.state) !== "200" || !payload.ChapterContent) {
    throw new Error(`Unexpected content payload for cid=${cid}`);
  }

  const decoded = decodeChapterContent(payload.ChapterContent);
  const text = normalizeChapterText(decoded);
  if (!text || text.length < 300) {
    throw new Error(`Decoded text too short for cid=${cid}: ${text.length}`);
  }

  return {
    ch,
    cid,
    title,
    url,
    chapterName: chapter.chapterName,
    text,
  };
}

async function main() {
  validateRange(START_CH, END_CH);

  const outDir = path.join(process.cwd(), "tools/scraper", OUTPUT_SUBDIR);
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];

  for (let ch = START_CH; ch <= END_CH; ch += 1) {
    const result = await scrapeChapter(ch);
    const file = `${String(ch).padStart(2, "0")}_${ch}화.txt`;
    const content =
      `[ ${NOVEL_LABEL} ${ch}화 ]\n` +
      `제목: ${result.title}\n` +
      `URL : ${result.url}\n\n` +
      `${"─".repeat(60)}\n\n` +
      `${result.chapterName}\n\n` +
      `${result.text}`;

    fs.writeFileSync(path.join(outDir, file), content, "utf8");
    results.push(result);
    console.log(`saved ${file} (${result.text.length} chars)`);
  }

  if (results.length > 0) {
    const merged =
      `${NOVEL_LABEL} ${START_CH}화~${END_CH}화 합본\n` +
      `스크래핑: ${new Date().toLocaleString("ko-KR")}\n\n` +
      results
        .map(
          (result) =>
            `${"═".repeat(60)}\n` +
            ` ${result.ch}화 | ${result.chapterName}\n` +
            ` URL: ${result.url}\n` +
            `${"═".repeat(60)}\n\n` +
            `${result.chapterName}\n\n` +
            `${result.text}`
        )
        .join("\n\n\n");

    fs.writeFileSync(
      path.join(outDir, `${NOVEL_LABEL}_${START_CH}화~${END_CH}화_합본.txt`),
      merged,
      "utf8"
    );
  }

  console.log(`done. saved ${results.length} chapters -> ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
