"""Shared dataset helpers used by routers, repositories, and scripts."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any

SIMPLIFIED_CHARS = set("来国书经时东车马爱国语见说话问题")
TRADITIONAL_CHARS = set("來國書經時東車馬愛國語見說話問題")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def detect_script(text: str) -> str:
    simp = sum(1 for char in text if char in SIMPLIFIED_CHARS)
    trad = sum(1 for char in text if char in TRADITIONAL_CHARS)
    if simp > trad:
        return "simplified"
    if trad > simp:
        return "traditional"
    return "unknown"


def expand_chapter_zh(chapter_zh: str) -> list[int]:
    if not chapter_zh:
        return []

    values: set[int] = set()
    tokens = [token.strip() for token in chapter_zh.split(",") if token.strip()]
    for token in tokens:
        if "-" in token:
            start_raw, end_raw = [part.strip() for part in token.split("-", 1)]
            if not start_raw.isdigit() or not end_raw.isdigit():
                continue
            start = int(start_raw)
            end = int(end_raw)
            if end < start:
                start, end = end, start
            values.update(range(start, end + 1))
            continue

        match = re.search(r"\d+", token)
        if match:
            values.add(int(match.group(0)))

    return sorted(values)


def chapter_zh_primary_value(chapter_zh: str, fallback: int = 0) -> int:
    expanded = expand_chapter_zh(chapter_zh)
    if expanded:
        return expanded[0]
    return fallback


def normalize_book_key(book_zh: str, book_ko: str, book: str) -> str:
    candidate = (book_zh or book_ko or book or "").strip().lower()
    return re.sub(r"\s+", " ", candidate)


def build_canonical_pair_key(normalized_book: str, chapter_zh_value: int) -> str:
    return f"{normalized_book}::zh{chapter_zh_value}"


def apply_dataset_defaults(record: dict[str, Any]) -> dict[str, Any]:
    data = dict(record)
    if "chapter_ko" not in data:
        data["chapter_ko"] = data.get("chapter", 0)
    if "chapter" not in data or data.get("chapter") is None:
        data["chapter"] = data.get("chapter_ko", 0)
    if "book_ko" not in data:
        data["book_ko"] = data.get("book", "")
    if "book_zh" not in data:
        data["book_zh"] = data.get("book", "")
    if "chapter_zh" not in data:
        data["chapter_zh"] = str(data.get("chapter_ko", data.get("chapter", "")))
    if "script" not in data:
        zh_sample = data.get("zh_text", "") or (data.get("ko_text", "")[:200])
        data["script"] = detect_script(zh_sample)
    if "genre" not in data or data["genre"] is None:
        data["genre"] = []
    if "new_term_candidates" not in data or data["new_term_candidates"] is None:
        data["new_term_candidates"] = []
    if "status" not in data:
        data["status"] = "draft"
    if "human_reviewed" not in data:
        data["human_reviewed"] = False
    if "review_note" not in data:
        data["review_note"] = ""
    if "ko_text_confirmed" not in data:
        data["ko_text_confirmed"] = ""
    if "notes" not in data:
        data["notes"] = ""
    if "source_lang" not in data:
        data["source_lang"] = "zh-CN"
    if "target_lang" not in data:
        data["target_lang"] = "ko-KR"
    if "translation_mode" not in data:
        data["translation_mode"] = "문학 번역"
    if "register" not in data:
        data["register"] = data.get("register_value", "")
    if "era_profile" not in data:
        data["era_profile"] = "ancient"
    if "updated_at" not in data or not data.get("updated_at"):
        data["updated_at"] = utc_now_iso()
    return data


def prepare_record_for_storage(record: dict[str, Any]) -> dict[str, Any]:
    data = apply_dataset_defaults(record)
    data["canonical_book_key"] = normalize_book_key(
        str(data.get("book_zh", "")),
        str(data.get("book_ko", "")),
        str(data.get("book", "")),
    )
    data["chapter_zh_primary"] = chapter_zh_primary_value(
        str(data.get("chapter_zh", "")),
        int(data.get("chapter_ko", 0) or 0),
    )
    return data


def strip_storage_fields(record: dict[str, Any]) -> dict[str, Any]:
    data = apply_dataset_defaults(record)
    data.pop("canonical_book_key", None)
    data.pop("chapter_zh_primary", None)
    return data


def sort_dataset_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        (strip_storage_fields(record) for record in records),
        key=lambda item: (
            str(item.get("book", "")),
            int(item.get("chapter_ko", 999999) or 999999),
            str(item.get("id", "")),
        ),
    )


def build_book_summaries(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    books: dict[str, dict[str, Any]] = {}
    for record in sort_dataset_records(records):
        book = str(record.get("book", ""))
        if book not in books:
            books[book] = {
                "book": book,
                "book_ko": str(record.get("book_ko", "") or book),
                "book_zh": str(record.get("book_zh", "") or ""),
                "chapters_ko": [],
                "chapters_zh": [],
                "genre": list(record.get("genre", [])),
                "total_records": 0,
                "records_with_source_text": 0,
                "confirmed": 0,
                "draft": 0,
            }

        entry = books[book]
        if not entry.get("book_ko") and record.get("book_ko"):
            entry["book_ko"] = str(record.get("book_ko", ""))
        if not entry.get("book_zh") and record.get("book_zh"):
            entry["book_zh"] = str(record.get("book_zh", ""))
        entry["chapters_ko"].append(record.get("chapter_ko"))
        entry["chapters_zh"].append(record.get("chapter_zh", ""))
        entry["total_records"] += 1
        if str(record.get("zh_text", "")).strip():
            entry["records_with_source_text"] += 1
        if record.get("status") == "confirmed":
            entry["confirmed"] += 1
        else:
            entry["draft"] += 1

    result = list(books.values())
    for entry in result:
        total = entry["total_records"] or 0
        source_count = entry["records_with_source_text"] or 0
        entry["source_coverage_percent"] = round((source_count / total) * 100) if total else 0
    return result


def build_dataset_stats(records: list[dict[str, Any]], glossary_terms: int) -> dict[str, Any]:
    public_records = sort_dataset_records(records)
    books = sorted({str(record.get("book", "")) for record in public_records if record.get("book", "")})
    source_count = sum(1 for record in public_records if str(record.get("zh_text", "")).strip())
    confirmed = sum(1 for record in public_records if record.get("status") == "confirmed")
    draft = sum(1 for record in public_records if record.get("status", "draft") == "draft")
    return {
        "total_records": len(public_records),
        "total_books": len(books),
        "books": books,
        "records_with_source_text": source_count,
        "records_with_zh": source_count,
        "glossary_terms": glossary_terms,
        "confirmed": confirmed,
        "draft": draft,
    }
