# 중한 문학 번역 에이전트 (Chinese-Korean Literary Translation Agent)

An AI-powered workstation for **translating Chinese web novels into Korean**, designed specifically for literary genres like 武侠 (wuxia), 仙侠 (xianxia), 고장극 (historical drama), and 言情 (romance).

It handles the unique challenges of literary translation — cultural sensitivity, era-specific language, glossary consistency, and annotation of culturally significant terms.

---

## Architecture

| Layer | Tech | Port |
|-------|------|------|
| **Frontend** | Next.js 14 + TypeScript + TailwindCSS (Dark Glassmorphism UI) | `3000` |
| **Backend** | FastAPI (Python) + Claude API (Anthropic) | `8000` |
| **Data** | Supabase (`dataset_records`) + canonical JSON glossary/style guide files | — |

```
┌──────────────────────────────────────────────┐
│  Next.js Frontend (localhost:3000)            │
│  ┌──────┐ ┌────────┐ ┌─────────┐ ┌────────┐ │
│  │Dash- │ │Glossary│ │Translate│ │Upload  │ │
│  │board │ │        │ │  Agent  │ │        │ │
│  └──┬───┘ └───┬────┘ └────┬────┘ └───┬────┘ │
│     └─────────┴───────────┴──────────┘      │
│              Next.js Rewrites /api/*         │
└──────────────────┬───────────────────────────┘
                   │ Proxy
┌──────────────────▼───────────────────────────┐
│  FastAPI Backend (localhost:8000)             │
│  ┌────────┐ ┌───────┐ ┌─────────┐ ┌──────┐  │
│  │Glossary│ │Dataset│ │Translate│ │Upload│  │
│  │ Router │ │Router │ │ Router  │ │Router│  │
│  └───┬────┘ └──┬────┘ └────┬────┘ └──┬───┘  │
│      │         │           │          │      │
│ glossary.json Supabase  Claude     auto-     │
│ style_guide  dataset    API      fetch zh    │
└──────────────────────────────────────────────┘
```

---

## Core Features

### 1. Dashboard (`/`)
Overview of all translation progress.
- Book-by-book progress cards with chapter counts
- Stat counters: total books, chapters, registered terms, confirmed translations
- Draft vs. confirmed summary
- Quick link to start translating

### 2. Glossary Management (`/glossary`)
Maintain translation consistency across all chapters and books.
- **Anki-style 3D flip cards** for learning/reviewing Chinese → Korean terms
- Filter by book, part-of-speech (품사), translation policy (고정 / 조건부 / 검토중)
- Keyboard shortcuts: `Space` (flip), `←/→` (navigate), `K` (mark known)
- Inline editing with backend sync (PUT `/api/glossary/{term_zh}`)
- Search across all terms

### 3. Translation Agent (`/translate`)
The core AI-powered translation feature.
- Sends Chinese text to **Claude** with a curated system prompt including:
  - **Glossary** — enforces specific term translations
  - **Style guide** — genre-specific writing rules
  - **Previous chapter sample** — maintains style consistency across chapters
- Returns three outputs:
  - **Korean translation** — the main translated text
  - **Annotations** — explains 한자어 (Sino-Korean words), 사자성어 (four-character idioms), 시/시구 (poetry), cultural terms, and place names
  - **Cultural flags** — catches 동북공정 (Northeast Project) sensitive items where Chinese culture might be incorrectly mapped to Korean equivalents
    - Example: 炕 (kang bed) ≠ 온돌 (Korean ondol heating)
    - Example: 中国式饺子 (Chinese dumpling) ≠ 한국식 만두
    - Items marked `사용자 판단 필요` get interactive **[Keep]** / **[Change]** buttons
- Configurable options:
  - Book selection (applies relevant glossary subset)
  - Genre tags (무협, 선협, 현대, 로맨스, 판타지, SF, 역사, 추리, 공포)
  - Era profile (ancient / mixed / modern / unknown — let AI decide)
  - Toggle annotations and cultural checks on/off

### 4. Training Data Upload (`/upload`)
Build and manage the parallel corpus for model improvement.
- **Dual-mode input**:
  - **File upload** — drag-and-drop `.txt`, `.md`, `.csv`, `.json` files
  - **Text paste** — large textarea for pasting translated text directly
- **Metadata fields**: book name, Korean chapter number, Chinese source chapter, script type (simplified/traditional/auto-detect)
- **Auto-processing pipeline**:
  - Fetches Chinese source text from supported novel sites (shuzhaige.com, etc.)
  - Detects simplified vs. traditional Chinese script
  - Extracts new glossary term candidates (unregistered 2-4 character Chinese terms appearing 3+ times)
- **Dataset table**: grouped by book with collapsible sections, preview modal
- **Confirm/export workflow**: review drafts → confirm → export as JSONL for fine-tuning

### 5. Trilingual UI
Full interface localization with instant switching:
- 🇰🇷 한국어 (Korean)
- 🇺🇸 English
- 🇨🇳 中文 (Chinese)

---

## Data Flow

```
Upload Korean translation
        │
        ▼
Auto-fetch Chinese source text (from supported sites)
        │
        ▼
Detect script type (simplified / traditional)
        │
        ▼
Extract new glossary term candidates
        │
        ▼
Store as "draft" record in Supabase dataset
        │
        ▼
Human review & edit
        │
        ▼
Confirm translation (status → "confirmed")
        │
        ▼
Export as fine-tuning dataset (JSONL)
```

---

## Supported Books

| Book | Genre | Era | Source |
|------|-------|-----|--------|
| 庶女明兰传 | 고장극 / 가문정치 / 언정 | Ancient | shuzhaige.com |
| 至尊神医之帝君要下嫁 | 현대판타지 / 신의 / 환생 | Mixed | shuqi.com |
| 天才小毒妃 | 고장극 / 의술 / 궁중암투 | Ancient | — |

New books can be added by extending `BOOK_SOURCES` in `upload.py`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Backend health check |
| `GET` | `/api/glossary` | List all terms (filter by `?book=`) |
| `POST` | `/api/glossary` | Add new term |
| `PUT` | `/api/glossary/{term_zh}` | Update term |
| `DELETE` | `/api/glossary/{term_zh}` | Delete term |
| `GET` | `/api/glossary/books` | List books in glossary |
| `GET` | `/api/dataset/` | List dataset records (filter by `?book=&chapter_ko=`) |
| `POST` | `/api/dataset/` | Add new record |
| `PUT` | `/api/dataset/{record_id}` | Update record |
| `GET` | `/api/dataset/books` | Book list with chapter info |
| `GET` | `/api/dataset/stats` | Dataset statistics |
| `POST` | `/api/dataset/{record_id}/confirm` | Confirm a translation |
| `GET` | `/api/dataset/{record_id}/export` | Export single record |
| `GET` | `/api/dataset/export/confirmed` | Export all confirmed (JSONL) |
| `POST` | `/api/translate/` | Translate text with AI |
| `POST` | `/api/translate/test` | API connection test |
| `POST` | `/api/upload/` | Upload file |
| `POST` | `/api/upload/text` | Upload text directly |
| `GET` | `/api/upload/books` | Supported books list |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.12+
- Anthropic API key

### 1. Frontend
```bash
npm install
npm run dev  # or PORT=3001 npm run dev if port 3000 is busy
```

Or start both frontend and backend together from the repo root:
```bash
./start-dev.sh
```

### 2. Backend
```bash
cd translation-agent
python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt
```

Use the template at `translation-agent/backend/.env.example`, then fill in `translation-agent/backend/.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
DATASET_BACKEND=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
DATASET_PATH=../data/dataset_multinovel.jsonl
GLOSSARY_PATH=../data/glossary.json
STYLE_GUIDE_PATH=../data/style_guide_v1.md
JOB_STORE_PATH=../data/jobs.sqlite3
```

Create the dataset table in Supabase:
```bash
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```

Normalize the glossary and migrate the existing JSONL dataset:
```bash
./venv/bin/python scripts/migrate_glossary_to_canonical.py
./venv/bin/python scripts/migrate_dataset_to_supabase.py --report-file migration-report.json
```

Start the server:
```bash
./venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Data Files
Place the following in `translation-agent/data/`:
- `glossary.json` — canonical term dictionary copied from the repo-root `glossary.json`
- `dataset_multinovel.jsonl` — backup / migration source for the legacy parallel corpus
- `style_guide_v1.md` — translation style guide

### 4. Verification
```bash
npm run lint
npx tsc --noEmit
npm run build
cd translation-agent
./venv/bin/python -m unittest discover -s backend/tests -v
```

---

## Project Structure

```
chinese_novel_translator/
├── archive/
│   └── root-backend-prototype/   # Legacy root-level backend prototype files
├── tools/
│   └── scraper/
│       ├── scrape_gyosul.js      # External text scraping utility
│       ├── SCRAPER_README.md     # Scraper runbook
│       └── 교술_chapters/         # Scraper outputs and debug artifacts
├── src/
│   ├── app/
│   │   ├── page.tsx              # Dashboard
│   │   ├── layout.tsx            # Root layout + HealthBanner
│   │   ├── globals.css           # Design system
│   │   ├── glossary/page.tsx     # Glossary (Anki cards)
│   │   ├── translate/page.tsx    # Translation agent
│   │   └── upload/page.tsx       # Data upload
│   ├── components/
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   └── HealthBanner.tsx      # Backend health check banner
│   ├── contexts/
│   │   ├── BackendHealthContext.tsx # Shared backend health state
│   │   └── LanguageContext.tsx      # i18n context provider
│   └── lib/
│       ├── api.ts                # API client (typed)
│       ├── download.ts           # Browser download helper
│       ├── polling.ts            # Shared polling helper
│       ├── types.ts              # TypeScript types (aligned with backend)
│       └── i18n.ts               # Translation dictionary (KO/EN/ZH)
├── translation-agent/
│   ├── backend/
│   │   ├── main.py               # FastAPI app + CORS + health
│   │   ├── routers/
│   │   │   ├── glossary.py       # Glossary CRUD
│   │   │   ├── dataset.py        # Dataset management
│   │   │   ├── translate.py      # Claude translation + annotations
│   │   │   └── upload.py         # File/text upload pipeline
│   │   ├── storage/              # Dataset repository + canonical data helpers
│   │   ├── requirements.txt
│   │   └── .env
│   ├── scripts/
│   │   ├── migrate_dataset_to_supabase.py
│   │   └── migrate_glossary_to_canonical.py
│   ├── supabase/
│   │   └── schema.sql
│   └── data/                     # Runtime data (not in git)
│       ├── glossary.json
│       ├── dataset_multinovel.jsonl
│       └── style_guide_v1.md
├── next.config.mjs               # API proxy rewrites
├── tailwind.config.ts
└── package.json
```
