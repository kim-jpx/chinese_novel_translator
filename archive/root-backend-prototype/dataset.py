"""
Dataset router - 학습 데이터셋 관리
chapter_ko: 한국어 번역 화수
chapter_zh: 중국어 원문 화수 (범위 표기 가능: "1", "1-2" 등)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Union
import json
import os
from pathlib import Path
from datetime import datetime, timezone

router = APIRouter()


def get_dataset_path() -> Path:
    return Path(os.getenv("DATASET_PATH", "../../dataset_multinovel.jsonl"))


class DatasetRecord(BaseModel):
    id: str
    book: str
    # 화수 분리: ko(번역 기준) / zh(원문 기준)
    chapter_ko: int                    # 한국어 번역 화수
    chapter_zh: str = ""               # 중국어 원문 화수 (범위 가능: "1", "1-2", "3")
    # 하위 호환: 기존 chapter 필드 유지
    chapter: Optional[int] = None
    # 한자 자형
    script: str = "unknown"            # simplified / traditional / unknown
    chapter_id: str = ""
    chapter_title_zh: str = ""
    genre: List[str] = []
    source_url: str = ""
    source_lang: str = "zh-CN"
    target_lang: str = "ko-KR"
    zh_text: str = ""
    ko_text: str
    ko_text_confirmed: str = ""        # 사람이 확정한 번역 (비어있으면 ko_text 사용)
    translation_mode: str = "문학 번역"
    register: str = ""
    era_profile: str = "ancient"
    status: str = "draft"              # draft / confirmed
    human_reviewed: bool = False
    review_note: str = ""
    notes: str = ""
    updated_at: Optional[str] = None


SIMPLIFIED_CHARS = set("来国书经时东车马爱国语见说话问题")
TRADITIONAL_CHARS = set("來國書經時東車馬愛國語見說話問題")


def detect_script(text: str) -> str:
    """간체/번체 자동 감지"""
    simp = sum(1 for c in text if c in SIMPLIFIED_CHARS)
    trad = sum(1 for c in text if c in TRADITIONAL_CHARS)
    if simp > trad:
        return "simplified"
    elif trad > simp:
        return "traditional"
    return "unknown"


def migrate_record(r: dict) -> dict:
    """기존 레코드에 신규 필드 자동 추가"""
    if "chapter_ko" not in r:
        r["chapter_ko"] = r.get("chapter", 0)
    if "chapter_zh" not in r:
        r["chapter_zh"] = str(r.get("chapter", r.get("chapter_ko", "")))
    if "script" not in r:
        zh = r.get("zh_text", "") or r.get("ko_text", "")[:200]
        r["script"] = detect_script(zh)
    if "status" not in r:
        r["status"] = "draft"
    if "human_reviewed" not in r:
        r["human_reviewed"] = False
    if "review_note" not in r:
        r["review_note"] = ""
    if "ko_text_confirmed" not in r:
        r["ko_text_confirmed"] = ""
    return r


def load_dataset() -> List[dict]:
    path = get_dataset_path()
    if not path.exists():
        return []
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            records.append(migrate_record(json.loads(line)))
    return records


def save_dataset(records: List[dict]):
    with get_dataset_path().open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


@router.get("/", response_model=List[DatasetRecord])
def get_dataset(book: Optional[str] = None, chapter_ko: Optional[int] = None):
    """데이터셋 조회. book/chapter_ko 필터 가능."""
    records = load_dataset()
    if book:
        records = [r for r in records if book.lower() in r.get("book", "").lower()]
    if chapter_ko:
        records = [r for r in records if r.get("chapter_ko") == chapter_ko]
    return records


@router.post("/", response_model=DatasetRecord)
def add_record(record: DatasetRecord):
    """새 레코드 추가."""
    records = load_dataset()
    if any(r["id"] == record.id for r in records):
        raise HTTPException(status_code=409, detail=f"이미 존재하는 레코드: {record.id}")
    data = record.model_dump()
    # chapter 필드 동기화
    data["chapter"] = record.chapter_ko
    if not data.get("chapter_zh"):
        data["chapter_zh"] = str(record.chapter_ko)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    records.append(data)
    records.sort(key=lambda r: (r.get("book", ""), r.get("chapter_ko", 9999)))
    save_dataset(records)
    return data


@router.put("/{record_id}", response_model=DatasetRecord)
def update_record(record_id: str, record: DatasetRecord):
    """레코드 수정."""
    records = load_dataset()
    for i, r in enumerate(records):
        if r["id"] == record_id:
            data = record.model_dump()
            data["chapter"] = record.chapter_ko
            data["updated_at"] = datetime.now(timezone.utc).isoformat()
            records[i] = data
            save_dataset(records)
            return data
    raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")


@router.get("/books")
def get_books():
    """작품 목록 + 화수 현황."""
    records = load_dataset()
    books = {}
    for r in records:
        book = r.get("book", "")
        if book not in books:
            books[book] = {
                "book": book,
                "chapters_ko": [],
                "chapters_zh": [],
                "genre": r.get("genre", [])
            }
        books[book]["chapters_ko"].append(r.get("chapter_ko"))
        books[book]["chapters_zh"].append(r.get("chapter_zh", ""))
    return list(books.values())


@router.get("/stats")
def get_stats():
    """데이터셋 통계."""
    records = load_dataset()
    books = set(r.get("book", "") for r in records)
    return {
        "total_records": len(records),
        "total_books": len(books),
        "books": sorted(list(books)),
        "records_with_zh": sum(1 for r in records if r.get("zh_text")),
        "confirmed": sum(1 for r in records if r.get("status") == "confirmed"),
        "draft": sum(1 for r in records if r.get("status", "draft") == "draft"),
    }


class ConfirmRequest(BaseModel):
    ko_text_confirmed: str   # 사람이 수정/확정한 번역
    review_note: str = ""


@router.post("/{record_id}/confirm", response_model=DatasetRecord)
def confirm_record(record_id: str, req: ConfirmRequest):
    """번역 확정: 수정된 번역을 저장하고 status를 confirmed로 변경."""
    records = load_dataset()
    for i, r in enumerate(records):
        if r["id"] == record_id:
            records[i]["ko_text_confirmed"] = req.ko_text_confirmed
            records[i]["status"] = "confirmed"
            records[i]["human_reviewed"] = True
            records[i]["review_note"] = req.review_note
            records[i]["updated_at"] = datetime.now(timezone.utc).isoformat()
            save_dataset(records)
            return records[i]
    raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")


@router.get("/{record_id}/export")
def export_record(record_id: str, fmt: str = "json"):
    """확정 번역 추출. fmt: json / txt / jsonl"""
    from fastapi.responses import PlainTextResponse, JSONResponse
    records = load_dataset()
    r = next((x for x in records if x["id"] == record_id), None)
    if not r:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")

    ko_final = r.get("ko_text_confirmed") or r.get("ko_text", "")

    if fmt == "txt":
        return PlainTextResponse(ko_final, media_type="text/plain; charset=utf-8")
    elif fmt == "jsonl":
        line = json.dumps({
            "id": r["id"],
            "book": r["book"],
            "chapter_ko": r.get("chapter_ko"),
            "chapter_zh": r.get("chapter_zh", ""),
            "zh": r.get("zh_text", ""),
            "ko": ko_final,
            "status": r.get("status"),
            "human_reviewed": r.get("human_reviewed", False),
        }, ensure_ascii=False)
        return PlainTextResponse(line, media_type="application/x-ndjson")
    else:
        return JSONResponse({
            "id": r["id"],
            "book": r["book"],
            "chapter_ko": r.get("chapter_ko"),
            "chapter_zh": r.get("chapter_zh", ""),
            "zh_text": r.get("zh_text", ""),
            "ko_text_confirmed": ko_final,
            "status": r.get("status"),
            "human_reviewed": r.get("human_reviewed", False),
            "review_note": r.get("review_note", ""),
        })


@router.get("/export/confirmed")
def export_all_confirmed(fmt: str = "jsonl"):
    """확정된 번역 전체 추출 (파인튜닝용 데이터셋)."""
    from fastapi.responses import PlainTextResponse, JSONResponse
    records = load_dataset()
    confirmed = [r for r in records if r.get("status") == "confirmed"]

    if not confirmed:
        raise HTTPException(status_code=404, detail="확정된 번역 없음")

    if fmt == "jsonl":
        lines = []
        for r in confirmed:
            ko_final = r.get("ko_text_confirmed") or r.get("ko_text", "")
            lines.append(json.dumps({
                "id": r["id"],
                "book": r["book"],
                "chapter_ko": r.get("chapter_ko"),
                "chapter_zh": r.get("chapter_zh", ""),
                "zh": r.get("zh_text", ""),
                "ko": ko_final,
            }, ensure_ascii=False))
        return PlainTextResponse("\n".join(lines), media_type="application/x-ndjson")
    else:
        result = []
        for r in confirmed:
            ko_final = r.get("ko_text_confirmed") or r.get("ko_text", "")
            result.append({"id": r["id"], "book": r["book"],
                          "zh": r.get("zh_text", ""), "ko": ko_final})
        return JSONResponse(result)
