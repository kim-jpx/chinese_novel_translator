"""
Upload pipeline router - 번역 텍스트 업로드 → 데이터셋 자동 누적
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import re
from pathlib import Path
from datetime import datetime, timezone
import urllib.request
import html

router = APIRouter()


def get_dataset_path() -> Path:
    return Path(os.getenv("DATASET_PATH", "../../dataset_multinovel.jsonl"))


def get_glossary_path() -> Path:
    return Path(os.getenv("GLOSSARY_PATH", "../../glossary.json"))

# 작품별 원문 소스 매핑
BOOK_SOURCES = {
    "庶女明兰传": {
        "base_url": "https://www.shuzhaige.com/1230/",
        "chapter_url_fn": lambda ch: f"https://www.shuzhaige.com/1230/{178220 + ch}.html",
        "parser": "shuzhaige",
        "genre": ["고장극", "가문정치", "언정"],
        "era_profile": "ancient",
    },
    "至尊神医之帝君要下嫁": {
        "base_url": "https://www.shuqi.com/reader?bid=9015656",
        "chapter_url_fn": lambda ch: f"https://www.shuqi.com/reader?bid=9015656&cid={2199164 + ch}",
        "parser": "shuqi_meta_only",
        "genre": ["현대판타지", "신의/의술", "환생", "무협요소"],
        "era_profile": "mixed",
    },
    "天才小毒妃": {
        "base_url": "",
        "chapter_url_fn": lambda ch: "",
        "parser": "none",
        "genre": ["고장극", "의술", "궁중암투", "언정"],
        "era_profile": "ancient",
    },
}


class UploadResult(BaseModel):
    id: str
    book: str
    chapter: int
    zh_fetched: bool
    new_terms: List[str]
    status: str


def detect_book_and_chapter(text: str) -> tuple[str, int]:
    """텍스트 첫 줄에서 작품명/화수 파악. 없으면 (unknown, 0)"""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return "unknown", 0

    # 화수 패턴: "1화", "1", "第1章", "제1화" 등
    first = lines[0]
    ch_match = re.search(r'(\d+)', first)
    chapter = int(ch_match.group(1)) if ch_match else 0

    return "unknown", chapter


def fetch_zh_shuzhaige(url: str) -> str:
    """shuzhaige에서 중국어 원문 추출"""
    try:
        raw = urllib.request.urlopen(url, timeout=15).read().decode('utf-8', 'ignore')
        m = re.search(r'<div id="content"[^>]*>(.*?)<div class="clearfix">', raw, re.S)
        if not m:
            m = re.search(r'<div id="content"[^>]*>(.*)</body>', raw, re.S)
        if not m:
            return ""
        body = m.group(1)
        body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
        body = re.sub(r'<br\s*/?>', '\n', body, flags=re.I)
        text = re.sub(r'<[^>]+>', '', body)
        text = html.unescape(text)
        lines = [l.strip() for l in text.splitlines()]
        lines = [l for l in lines if l and '马上记住书斋阁' not in l
                 and not l.startswith('上一章') and not l.startswith('下一章')]
        return '\n'.join(lines)
    except Exception:
        return ""


def extract_new_terms(ko_text: str, zh_text: str) -> List[str]:
    """기존 glossary에 없는 한자 용어 후보 간단 추출"""
    existing = set()
    if GLOSSARY_PATH.exists():
        g = json.loads(GLOSSARY_PATH.read_text(encoding='utf-8'))
        existing = {t['term_zh'] for t in g}

    # 2~4글자 한자 패턴
    candidates = re.findall(r'[\u4e00-\u9fff]{2,4}', zh_text)
    freq: dict[str, int] = {}
    for c in candidates:
        freq[c] = freq.get(c, 0) + 1

    # 3회 이상 등장하고 glossary에 없는 것
    new_terms = [t for t, cnt in freq.items() if cnt >= 3 and t not in existing]
    return new_terms[:20]  # 최대 20개


def load_dataset() -> List[dict]:
    path = get_dataset_path()
    if not path.exists():
        return []
    records = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.strip():
            records.append(json.loads(line))
    return records


def save_dataset(records: List[dict]):
    with get_dataset_path().open('w', encoding='utf-8') as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')


class TextUploadRequest(BaseModel):
    """텍스트 직접 붙여넣기용 요청 스키마"""
    ko_text: str
    book: str
    chapter: int
    chapter_zh: str = ""
    script: str = "unknown"


@router.post("/text", response_model=UploadResult)
async def upload_translation_text(req: TextUploadRequest):
    """
    텍스트 직접 붙여넣기로 업로드 → 원문 자동 매핑 → 데이터셋 누적
    파일 대신 JSON body로 ko_text를 직접 전달.
    """
    ko_text = req.ko_text.strip()
    if not ko_text:
        raise HTTPException(status_code=400, detail="빈 텍스트")
    return await _process_upload(
        ko_text=ko_text,
        book=req.book,
        chapter=req.chapter,
        chapter_zh=req.chapter_zh,
        script=req.script,
    )


@router.post("/", response_model=UploadResult)
async def upload_translation(
    file: UploadFile = File(...),
    book: str = Form(...),
    chapter: int = Form(...),
    chapter_zh: str = Form(""),    # 중국어 원문 화수 (비워두면 chapter와 동일)
    script: str = Form("unknown"), # simplified / traditional / unknown
):
    """
    번역 텍스트 파일 업로드 → 원문 자동 매핑 → 데이터셋 누적
    """
    content = await file.read()
    ko_text = content.decode('utf-8', 'ignore').strip()

    if not ko_text:
        raise HTTPException(status_code=400, detail="빈 파일")

    return await _process_upload(
        ko_text=ko_text,
        book=book,
        chapter=chapter,
        chapter_zh=chapter_zh,
        script=script,
    )


async def _process_upload(
    ko_text: str,
    book: str,
    chapter: int,
    chapter_zh: str = "",
    script: str = "unknown",
) -> UploadResult:
    """파일/텍스트 공통 업로드 처리 로직"""
    record_id = f"{re.sub(r'[^a-z0-9]', '', book.lower()[:20])}_ch{chapter:03d}"

    records = load_dataset()
    existing_ids = {r['id'] for r in records}
    if record_id in existing_ids:
        raise HTTPException(status_code=409, detail=f"이미 존재: {record_id} (덮어쓰려면 PUT /api/dataset/{record_id} 사용)")

    # 원문 가져오기
    zh_text = ""
    zh_fetched = False
    source_url = ""

    if book in BOOK_SOURCES:
        src = BOOK_SOURCES[book]
        source_url = src["chapter_url_fn"](chapter)
        if src["parser"] == "shuzhaige" and source_url:
            zh_text = fetch_zh_shuzhaige(source_url)
            zh_fetched = bool(zh_text)

    new_terms = extract_new_terms(ko_text, zh_text) if zh_text else []

    book_meta = BOOK_SOURCES.get(book, {})
    zh_chapter = chapter_zh if chapter_zh else str(chapter)
    from routers.dataset import detect_script
    detected_script = script if script != "unknown" else detect_script(zh_text or ko_text[:200])

    record = {
        "id": record_id,
        "book": book,
        "chapter": chapter,
        "chapter_ko": chapter,
        "chapter_zh": zh_chapter,
        "script": detected_script,
        "chapter_id": "",
        "chapter_title_zh": "",
        "genre": book_meta.get("genre", []),
        "source_url": source_url,
        "source_lang": "zh-CN",
        "target_lang": "ko-KR",
        "zh_text": zh_text,
        "ko_text": ko_text,
        "ko_text_confirmed": "",
        "translation_mode": "문학 번역",
        "register": "",
        "era_profile": book_meta.get("era_profile", "ancient"),
        "status": "draft",
        "human_reviewed": False,
        "review_note": "",
        "new_term_candidates": new_terms,
        "notes": f"업로드: {datetime.now(timezone.utc).isoformat()}",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    records.append(record)
    records.sort(key=lambda r: (r.get('book', ''), r.get('chapter', 9999)))
    save_dataset(records)

    return UploadResult(
        id=record_id,
        book=book,
        chapter=chapter,
        zh_fetched=zh_fetched,
        new_terms=new_terms,
        status="added"
    )


@router.get("/books")
def list_supported_books():
    """원문 자동 매핑 지원 작품 목록"""
    return [
        {
            "book": book,
            "parser": meta["parser"],
            "genre": meta["genre"],
            "era_profile": meta["era_profile"],
        }
        for book, meta in BOOK_SOURCES.items()
    ]
