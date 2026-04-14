# 교술 스크래퍼 실행 가이드 (Antigravity Agent용)

## 목적
`scrape_gyosul.js`를 실행해서 교술 1화~5화 본문 텍스트를 `교술_chapters/` 폴더에 저장한다.

---

## 작업 디렉토리
```
/Users/zone/My Projects/chinese_novel_translator/
```

---

## 1단계: 의존성 설치

```bash
cd "/Users/zone/My Projects/chinese_novel_translator"
npm install playwright-extra puppeteer-extra-plugin-stealth
npx playwright install chromium
```

---

## 2단계: 스크립트 실행 전 주의사항

현재 `scrape_gyosul.js`는 `Chrome Profile 26 (Aira)` 경로를 직접 사용하도록 설정되어 있다.  
**Antigravity는 해당 Chrome 프로필에 접근할 수 없으므로**, 실행 전에 아래 수정을 적용해야 한다.

### 수정 방법: Chrome 프로필 대신 stealth 모드로 실행

`scrape_gyosul.js`의 `main()` 함수 안에서 `launchPersistentContext` 부분을 아래 코드로 교체한다:

**교체 전 (현재 코드):**
```js
const context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
  executablePath: CHROME_EXEC,
  headless: false,
  ...
});
const page = await context.newPage();
```

**교체 후 (Antigravity용):**
```js
const browser = await chromium.launch({
  headless: false,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
  ],
});
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'ko-KR',
  viewport: null,
  extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8' },
});
const page = await context.newPage();
```

그리고 `finally` 블록의 `context.close()` 를 `browser.close()` 로 변경한다.

---

## 3단계: 실행

```bash
cd "/Users/zone/My Projects/chinese_novel_translator"
node scrape_gyosul.js
```

---

## 4단계: Cloudflare 처리

스크립트는 `headed` (비헤드리스) 모드로 실행되며, Cloudflare 챌린지가 뜨면 **브라우저 창이 자동으로 열린다**.

- **자동 통과**: stealth 플러그인이 자동화 신호를 숨기므로 대부분 자동 통과됨
- **수동 통과 필요 시**: 브라우저 창에 체크박스가 나타나면 클릭하면 됨
- **대기 시간**: 최대 2분 (120초)

---

## 5단계: 결과 확인

스크래핑 성공 시 아래 파일들이 생성된다:

```
교술_chapters/
├── 01_1화.txt
├── 02_2화.txt
├── 03_3화.txt
├── 04_4화.txt
├── 05_5화.txt
└── 교술_1화~5화_합본.txt
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `Cannot find module 'playwright-extra'` | 의존성 미설치 | 1단계 재실행 |
| 2분 후 Cloudflare 타임아웃 | IP 차단 | VPN 변경 후 재시도 |
| 본문이 300자 미만 | 페이지 구조 변경 | `debug_ch*.png` 스크린샷 확인 |
| `error_screenshot.png` 생성 | 예상치 못한 오류 | 스크린샷으로 원인 파악 |

---

## 스크립트 핵심 동작 방식

- **챕터 URL**: 인덱스 파싱 없이 직접 하드코딩된 URL 사용
- **본문 추출**: 북토끼의 동적 CSS 클래스 패턴(`/^[a-z][0-9a-f]{8,}/`) 으로 본문 div 탐지
- **Cloudflare 우회**: `playwright-extra` + `puppeteer-extra-plugin-stealth` 조합

---

## 대상 URL 목록

| 화수 | URL |
|------|-----|
| 1화 | https://booktoki469.com/novel/15577942 |
| 2화 | https://booktoki469.com/novel/15577946 |
| 3화 | https://booktoki469.com/novel/15577950 |
| 4화 | https://booktoki469.com/novel/15577954 |
| 5화 | https://booktoki469.com/novel/15577962 |
