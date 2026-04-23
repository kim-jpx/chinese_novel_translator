"""
Dataset router - 학습 데이터셋 관리
chapter_ko: 한국어 번역 화수
chapter_zh: 중국어 원문 화수 (범위 표기 가능: "1", "1-2" 등)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.storage.config import get_dataset_backend, get_dataset_path
from backend.storage.dataset_repository import (
    canonical_pair_for_record,
    canonical_pair_for_values,
    DatasetBackendUnavailableError,
    DatasetRepositoryError,
    get_dataset_repository,
)
from backend.storage.dataset_utils import (
    build_canonical_pair_key,
    detect_script,
    expand_chapter_zh,
    normalize_book_key,
    sort_dataset_records,
)
from backend.storage.draft_history_store import get_draft_history_store
from backend.storage.editor_state import (
    dehydrate_record_editor_state,
    hydrate_record_editor_state,
)
from backend.storage.glossary_store import count_glossary_terms

router = APIRouter()
logger = logging.getLogger(__name__)


def get_repository():
    try:
        return get_dataset_repository()
    except DatasetBackendUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def get_dataset_path_legacy() -> Path:
    return get_dataset_path()


class DatasetAlignmentRow(BaseModel):
    id: str
    order: int = 0
    source_text: str = ""
    translation_text: str = ""
    locked: bool = False
    origin: str = "manual"
    source_indexes: list[int] = []
    translation_indexes: list[int] = []


class DraftVerifyCategorySnapshot(BaseModel):
    id: str
    label: str = ""
    score: int = 0
    status: str = "warning"
    comment: str = ""


class DraftVerifyIssueSnapshot(BaseModel):
    severity: str = "minor"
    category: str = "accuracy"
    source_excerpt: str = ""
    translation_excerpt: str = ""
    problem: str
    suggestion: str = ""


class SavedVerifyReport(BaseModel):
    id: str
    created_at: str
    overall_score: int = 0
    verdict: str = "needs_minor_revision"
    summary: str = ""
    categories: list[DraftVerifyCategorySnapshot] = []
    issues: list[DraftVerifyIssueSnapshot] = []
    strengths: list[str] = []
    model: str = ""


class DatasetRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    book: str
    book_ko: str = ""
    book_zh: str = ""
    chapter_ko: int
    chapter_zh: str = ""
    chapter: Optional[int] = None
    script: str = "unknown"
    chapter_id: str = ""
    chapter_title_zh: str = ""
    genre: list[str] = []
    source_url: str = ""
    source_lang: str = "zh-CN"
    target_lang: str = "ko-KR"
    zh_text: str = ""
    ko_text: str
    ko_text_confirmed: str = ""
    translation_mode: str = "문학 번역"
    register_value: str = Field(default="", alias="register", serialization_alias="register")
    era_profile: str = "ancient"
    status: str = "draft"
    human_reviewed: bool = False
    review_note: str = ""
    notes: str = ""
    updated_at: Optional[str] = None
    new_term_candidates: list[str] = []
    alignment_rows: list[DatasetAlignmentRow] = []
    verify_reports: list[SavedVerifyReport] = []


class BookInfo(BaseModel):
    book: str
    book_ko: str = ""
    book_zh: str = ""
    chapters_ko: list[int]
    chapters_zh: list[str]
    genre: list[str]
    total_records: int
    records_with_source_text: int
    confirmed: int
    draft: int
    source_coverage_percent: int


class DatasetStats(BaseModel):
    total_records: int
    total_books: int
    books: list[str]
    records_with_source_text: int
    records_with_zh: int
    glossary_terms: int
    confirmed: int
    draft: int


class BookTitleUpdateRequest(BaseModel):
    current_book: str
    book: str = ""
    book_ko: str = ""
    book_zh: str = ""


class BookTitleConflict(BaseModel):
    record_id: str
    chapter_ko: int
    chapter_zh: str
    conflicting_record_id: str
    conflicting_book: str


class BookTitleUpdateResult(BaseModel):
    updated_count: int
    book: str
    book_ko: str = ""
    book_zh: str = ""
    conflicts: list[BookTitleConflict] = []


class ConfirmRequest(BaseModel):
    ko_text_confirmed: str
    review_note: str = ""
    alignment_rows: list[DatasetAlignmentRow] = []


class DraftHistoryItem(BaseModel):
    id: str
    record_id: str
    book: str = ""
    chapter_ko: int = 0
    chapter_zh: str = ""
    zh_text: str = ""
    ko_text: str = ""
    ko_text_confirmed: str = ""
    review_note: str = ""
    notes: str = ""
    status: str = "draft"
    source: str = "save"
    created_at: str
    alignment_rows: list[DatasetAlignmentRow] = []
    verify_reports: list[SavedVerifyReport] = []


class DraftHistoryRestoreResult(BaseModel):
    record: DatasetRecord
    history: DraftHistoryItem


def draft_history_contents_equal(snapshot: dict, record: dict) -> bool:
    for field in ("zh_text", "ko_text", "ko_text_confirmed", "review_note", "notes", "status"):
        if str(snapshot.get(field, "") or "") != str(record.get(field, "") or ""):
            return False
    return True


def hydrate_dataset_record(record: dict) -> dict:
    return hydrate_record_editor_state(record)


def dehydrate_dataset_record(record: DatasetRecord | dict) -> dict:
    payload = record if isinstance(record, dict) else record.model_dump(by_alias=True)
    return dehydrate_record_editor_state(payload)


def hydrate_draft_history_item(snapshot: dict) -> dict:
    return hydrate_record_editor_state(snapshot)


def append_draft_history_snapshot(record: dict, *, source: str = "save") -> None:
    try:
        get_draft_history_store().append_snapshot(record, source=source)
    except Exception:
        logger.exception("Failed to append draft history snapshot for record %s", record.get("id"))


def ensure_previous_draft_history_snapshot(record: dict, *, source: str = "before_save") -> None:
    try:
        store = get_draft_history_store()
        latest = store.list_snapshots(str(record.get("id", "")), limit=1)
        if latest and draft_history_contents_equal(latest[0], record):
            return
        store.append_snapshot(record, source=source)
    except Exception:
        logger.exception("Failed to append previous draft history snapshot for record %s", record.get("id"))


def load_dataset(
    *,
    book: Optional[str] = None,
    book_exact: Optional[str] = None,
    chapter_ko: Optional[int] = None,
    chapter_zh: Optional[str] = None,
    status: Optional[str] = None,
) -> list[dict]:
    return get_repository().list_records(
        book=book,
        book_exact=book_exact,
        chapter_ko=chapter_ko,
        chapter_zh=chapter_zh,
        status=status,
    )


def save_dataset(records: list[dict]):
    get_repository().replace_all(records)


def merge_records_by_zh_chapter(records: list[dict]) -> tuple[list[dict], int, int]:
    merged: list[dict] = []
    index_by_key: dict[str, int] = {}
    merged_count = 0
    conflict_count = 0

    for record in sort_dataset_records(records):
        normalized_book = normalize_book_key(
            str(record.get("book_zh", "")),
            str(record.get("book_ko", "")),
            str(record.get("book", "")),
        )
        chapter_zh_numbers = expand_chapter_zh(str(record.get("chapter_zh", "")))
        if not normalized_book or not chapter_zh_numbers:
            merged.append(dict(record))
            continue

        key = build_canonical_pair_key(normalized_book, chapter_zh_numbers[0])
        if key not in index_by_key:
            index_by_key[key] = len(merged)
            merged.append(dict(record))
            continue

        merged_count += 1
        base = merged[index_by_key[key]]
        now = datetime.now(timezone.utc).isoformat()

        for field in ("zh_text", "ko_text"):
            existing_val = str(base.get(field, "")).strip()
            incoming_val = str(record.get(field, "")).strip()
            if not existing_val and incoming_val:
                base[field] = record.get(field, "")
            elif existing_val and incoming_val and existing_val != incoming_val:
                conflict_count += 1
                note_line = f"[merge_conflict:{field}] kept existing, skipped duplicate at {now}"
                base["notes"] = f"{base.get('notes', '')}\n{note_line}".strip()

        for field in ("book_ko", "book_zh", "source_url"):
            if not base.get(field) and record.get(field):
                base[field] = record[field]
        if not base.get("genre") and record.get("genre"):
            base["genre"] = list(record.get("genre", []))

        existing_terms = set(base.get("new_term_candidates", []))
        incoming_terms = set(record.get("new_term_candidates", []))
        if existing_terms or incoming_terms:
            base["new_term_candidates"] = sorted(existing_terms.union(incoming_terms))
        base["updated_at"] = now

    return merged, merged_count, conflict_count


@router.get("/", response_model=list[DatasetRecord])
def get_dataset(
    book: Optional[str] = None,
    book_exact: Optional[str] = None,
    chapter_ko: Optional[int] = None,
    chapter_zh: Optional[str] = None,
    status: Optional[str] = None,
):
    if status is None:
        records = load_dataset(book=book, book_exact=book_exact, chapter_ko=chapter_ko)
    else:
        records = load_dataset(
            book=book,
            book_exact=book_exact,
            chapter_ko=chapter_ko,
            status=status,
        )
    if book_exact:
        records = [
            record for record in records if str(record.get("book", "")).strip() == book_exact.strip()
        ]
    elif book:
        records = [
            record for record in records if book.lower() in str(record.get("book", "")).lower()
        ]
    if chapter_ko is not None:
        records = [
            record for record in records if int(record.get("chapter_ko", -1) or -1) == chapter_ko
        ]
    if chapter_zh:
        target_chapters = set(expand_chapter_zh(chapter_zh))
        if target_chapters:
            records = [
                record
                for record in records
                if target_chapters.intersection(
                    set(expand_chapter_zh(str(record.get("chapter_zh", ""))))
                )
            ]
        else:
            records = [
                record
                for record in records
                if str(record.get("chapter_zh", "")).strip() == chapter_zh.strip()
            ]
    if status:
        records = [
            record for record in records if str(record.get("status", "")).strip() == status.strip()
        ]
    return [hydrate_dataset_record(record) for record in records]


@router.post("/", response_model=DatasetRecord)
def add_record(record: DatasetRecord):
    repo = get_repository()
    if repo.get_record(record.id):
        raise HTTPException(status_code=409, detail=f"이미 존재하는 레코드: {record.id}")
    try:
        created = repo.create_record(dehydrate_dataset_record(record))
        append_draft_history_snapshot(created, source="create")
        return hydrate_dataset_record(created)
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/{record_id}", response_model=DatasetRecord)
def update_record(record_id: str, record: DatasetRecord):
    repo = get_repository()
    existing = repo.get_record(record_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")
    try:
        ensure_previous_draft_history_snapshot(existing, source="before_save")
        updated = repo.update_record(record_id, dehydrate_dataset_record(record))
        append_draft_history_snapshot(updated, source="save")
        return hydrate_dataset_record(updated)
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/{record_id}")
def delete_record(record_id: str):
    deleted = get_repository().delete_record(record_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")
    return {"deleted": record_id}


@router.get("/{record_id}/draft-history", response_model=list[DraftHistoryItem])
def list_draft_history(record_id: str, limit: int = 50):
    if not get_repository().get_record(record_id):
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")
    try:
        return [
            hydrate_draft_history_item(snapshot)
            for snapshot in get_draft_history_store().list_snapshots(record_id, limit=limit)
        ]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"초안 히스토리를 불러올 수 없습니다: {exc}") from exc


@router.post(
    "/{record_id}/draft-history/{history_id}/restore",
    response_model=DraftHistoryRestoreResult,
)
def restore_draft_history(record_id: str, history_id: str):
    repo = get_repository()
    record = repo.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")
    try:
        snapshot = get_draft_history_store().get_snapshot(record_id, history_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"초안 히스토리를 불러올 수 없습니다: {exc}") from exc
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"초안 히스토리 없음: {history_id}")

    ensure_previous_draft_history_snapshot(record, source="before_restore")
    restored = dict(record)
    restored["zh_text"] = snapshot.get("zh_text", "")
    restored["ko_text"] = snapshot.get("ko_text", "")
    restored["ko_text_confirmed"] = snapshot.get("ko_text_confirmed", "")
    restored["review_note"] = snapshot.get("review_note", "")
    restored["notes"] = snapshot.get("notes", "")
    restored["status"] = snapshot.get("status", "draft") or "draft"
    restored["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        updated = repo.update_record(record_id, restored)
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"record": hydrate_dataset_record(updated), "history": hydrate_draft_history_item(snapshot)}


@router.get("/books", response_model=list[BookInfo])
def get_books():
    return get_repository().get_book_summaries()


@router.put("/books/title", response_model=BookTitleUpdateResult)
def update_book_title(req: BookTitleUpdateRequest):
    current_book = req.current_book.strip()
    book_ko = req.book_ko.strip()
    book_zh = req.book_zh.strip()
    book_display = req.book.strip() or book_ko or book_zh
    if not current_book:
        raise HTTPException(status_code=400, detail="current_book은 필수입니다.")
    if not book_ko and not book_zh:
        raise HTTPException(status_code=400, detail="book_ko 또는 book_zh 중 하나는 입력해야 합니다.")

    repo = get_repository()
    all_records = repo.list_records()
    target_records = [
        record for record in all_records if str(record.get("book", "")).strip() == current_book
    ]
    if not target_records:
        raise HTTPException(status_code=404, detail=f"작품 레코드 없음: {current_book}")

    target_ids = {str(record.get("id", "")) for record in target_records}
    other_pairs: dict[tuple[str, int], dict] = {}
    for record in all_records:
        if str(record.get("id", "")) in target_ids:
            continue
        pair = canonical_pair_for_record(record)
        if pair[0] and pair[1]:
            other_pairs[pair] = record

    conflicts: list[BookTitleConflict] = []
    for record in target_records:
        pair = canonical_pair_for_values(
            book_zh,
            book_ko,
            book_display,
            str(record.get("chapter_zh", "")),
            int(record.get("chapter_ko", 0) or 0),
        )
        conflicting = other_pairs.get(pair)
        if conflicting:
            conflicts.append(
                BookTitleConflict(
                    record_id=str(record.get("id", "")),
                    chapter_ko=int(record.get("chapter_ko", 0) or 0),
                    chapter_zh=str(record.get("chapter_zh", "")),
                    conflicting_record_id=str(conflicting.get("id", "")),
                    conflicting_book=str(conflicting.get("book", "")),
                )
            )

    if conflicts:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "제목 변경 시 다른 작품의 같은 원문 화수와 충돌합니다.",
                "conflicts": [conflict.model_dump() for conflict in conflicts],
            },
        )

    updated_count = 0
    now = datetime.now(timezone.utc).isoformat()
    try:
        for record in target_records:
            updated = dict(record)
            updated["book"] = book_display
            updated["book_ko"] = book_ko
            updated["book_zh"] = book_zh
            updated["updated_at"] = now
            repo.update_record(str(record["id"]), updated)
            updated_count += 1
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return BookTitleUpdateResult(
        updated_count=updated_count,
        book=book_display,
        book_ko=book_ko,
        book_zh=book_zh,
        conflicts=[],
    )


@router.get("/stats", response_model=DatasetStats)
def get_stats():
    return get_repository().get_dataset_stats(count_glossary_terms())


@router.post("/merge-duplicates")
def merge_duplicate_records():
    if get_dataset_backend() != "file":
        raise HTTPException(
            status_code=409,
            detail="merge-duplicates는 DATASET_BACKEND=file 일 때만 지원됩니다. Supabase는 canonical pair 중복을 DB에서 막습니다.",
        )
    records = load_dataset()
    if not records:
        return {"merged_count": 0, "conflict_count": 0, "backup_path": ""}

    dataset_path = get_dataset_path_legacy()
    backup_path = dataset_path.with_suffix(f"{dataset_path.suffix}.bak")
    if dataset_path.exists():
        backup_path.write_text(dataset_path.read_text(encoding="utf-8"), encoding="utf-8")

    merged_records, merged_count, conflict_count = merge_records_by_zh_chapter(records)
    try:
        save_dataset(merged_records)
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "merged_count": merged_count,
        "conflict_count": conflict_count,
        "backup_path": str(backup_path) if backup_path.exists() else "",
    }


@router.post("/{record_id}/confirm", response_model=DatasetRecord)
def confirm_record(record_id: str, req: ConfirmRequest):
    repo = get_repository()
    record = repo.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")

    previous_record = dict(record)
    hydrated_record = hydrate_dataset_record(record)
    record["ko_text_confirmed"] = req.ko_text_confirmed
    record["status"] = "confirmed"
    record["human_reviewed"] = True
    record["review_note"] = req.review_note
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    record["notes"] = hydrated_record.get("notes", record.get("notes", ""))
    record["alignment_rows"] = [
        row.model_dump() if isinstance(row, BaseModel) else row
        for row in (req.alignment_rows or hydrated_record.get("alignment_rows", []))
    ]
    try:
        ensure_previous_draft_history_snapshot(previous_record, source="before_confirm")
        updated = repo.update_record(record_id, dehydrate_dataset_record(record))
        append_draft_history_snapshot(updated, source="confirm")
        return hydrate_dataset_record(updated)
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{record_id}/export")
def export_record(record_id: str, fmt: str = "json", allow_draft: bool = False):
    from fastapi.responses import JSONResponse, PlainTextResponse

    record = get_repository().get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")
    if record.get("status") != "confirmed" and not allow_draft:
        raise HTTPException(
            status_code=409,
            detail="확정된 번역만 export할 수 있습니다. draft export가 필요하면 allow_draft=true를 명시하세요.",
        )

    ko_final = record.get("ko_text_confirmed") or record.get("ko_text", "")

    if fmt == "txt":
        return PlainTextResponse(ko_final, media_type="text/plain; charset=utf-8")
    if fmt == "jsonl":
        line = json.dumps(
            {
                "id": record["id"],
                "book": record["book"],
                "chapter_ko": record.get("chapter_ko"),
                "chapter_zh": record.get("chapter_zh", ""),
                "zh": record.get("zh_text", ""),
                "ko": ko_final,
                "status": record.get("status"),
                "human_reviewed": record.get("human_reviewed", False),
            },
            ensure_ascii=False,
        )
        return PlainTextResponse(line, media_type="application/x-ndjson")
    return JSONResponse(
        {
            "id": record["id"],
            "book": record["book"],
            "chapter_ko": record.get("chapter_ko"),
            "chapter_zh": record.get("chapter_zh", ""),
            "zh_text": record.get("zh_text", ""),
            "ko_text_confirmed": ko_final,
            "status": record.get("status"),
            "human_reviewed": record.get("human_reviewed", False),
            "review_note": record.get("review_note", ""),
        }
    )


@router.get("/export/confirmed")
def export_all_confirmed(fmt: str = "jsonl"):
    from fastapi.responses import JSONResponse, PlainTextResponse

    confirmed = [
        record for record in load_dataset() if record.get("status") == "confirmed"
    ]
    if not confirmed:
        raise HTTPException(status_code=404, detail="확정된 번역 없음")

    if fmt == "jsonl":
        lines = []
        for record in confirmed:
            ko_final = record.get("ko_text_confirmed") or record.get("ko_text", "")
            lines.append(
                json.dumps(
                    {
                        "id": record["id"],
                        "book": record["book"],
                        "chapter_ko": record.get("chapter_ko"),
                        "chapter_zh": record.get("chapter_zh", ""),
                        "zh": record.get("zh_text", ""),
                        "ko": ko_final,
                    },
                    ensure_ascii=False,
                )
            )
        return PlainTextResponse("\n".join(lines), media_type="application/x-ndjson")

    result = []
    for record in confirmed:
        ko_final = record.get("ko_text_confirmed") or record.get("ko_text", "")
        result.append(
            {
                "id": record["id"],
                "book": record["book"],
                "zh": record.get("zh_text", ""),
                "ko": ko_final,
            }
        )
    return JSONResponse(result)
