"""Helpers for dataset/glossary migration and synchronization."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from backend.storage.config import get_glossary_path, get_root_glossary_path
from backend.storage.dataset_utils import (
    apply_dataset_defaults,
    prepare_record_for_storage,
    strip_storage_fields,
)

RICH_TEXT_FIELDS = (
    "zh_text",
    "ko_text",
    "ko_text_confirmed",
    "review_note",
    "notes",
)
SIMPLE_TEXT_FIELDS = (
    "book",
    "book_ko",
    "book_zh",
    "chapter_zh",
    "chapter_title_zh",
    "source_url",
    "source_lang",
    "target_lang",
    "translation_mode",
    "register",
    "era_profile",
    "script",
)
LIST_FIELDS = ("genre", "new_term_candidates")
BOOL_FIELDS = ("human_reviewed",)
INT_FIELDS = ("chapter", "chapter_ko")
CRITICAL_CONFLICT_FIELDS = ("zh_text", "ko_text", "ko_text_confirmed")


def _parse_timestamp(value: str | None) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    raw = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _string_value(record: dict[str, Any], field: str) -> str:
    return str(record.get(field, "") or "").strip()


def record_richness_score(record: dict[str, Any]) -> int:
    data = apply_dataset_defaults(record)
    score = 0
    for field in RICH_TEXT_FIELDS:
        # Long-form content counts more heavily when choosing canonical records.
        score += len(_string_value(data, field))
    for field in SIMPLE_TEXT_FIELDS:
        if _string_value(data, field):
            score += 10
    for field in LIST_FIELDS:
        score += len(data.get(field, []) or []) * 5
    if data.get("status") == "confirmed":
        score += 50
    if data.get("human_reviewed"):
        score += 25
    return score


def canonical_identity(record: dict[str, Any]) -> tuple[str, int]:
    prepared = prepare_record_for_storage(record)
    return (
        str(prepared.get("canonical_book_key", "")),
        int(prepared.get("chapter_zh_primary", 0) or 0),
    )


def merge_records_for_sync(
    base_record: dict[str, Any],
    incoming_record: dict[str, Any],
) -> tuple[dict[str, Any], bool]:
    base = apply_dataset_defaults(base_record)
    incoming = apply_dataset_defaults(incoming_record)
    merged = dict(base)

    base_ts = _parse_timestamp(base.get("updated_at"))
    incoming_ts = _parse_timestamp(incoming.get("updated_at"))
    prefer_incoming = incoming_ts >= base_ts
    conflict = False

    for field in SIMPLE_TEXT_FIELDS:
        base_val = _string_value(merged, field)
        incoming_val = _string_value(incoming, field)
        if not base_val and incoming_val:
            merged[field] = incoming[field]
            continue
        if base_val and incoming_val and base_val != incoming_val and prefer_incoming:
            merged[field] = incoming[field]

    for field in RICH_TEXT_FIELDS:
        base_val = _string_value(merged, field)
        incoming_val = _string_value(incoming, field)
        if not base_val and incoming_val:
            merged[field] = incoming[field]
            continue
        if base_val and incoming_val and base_val != incoming_val:
            if field in CRITICAL_CONFLICT_FIELDS:
                conflict = True
            if prefer_incoming:
                merged[field] = incoming[field]

    for field in LIST_FIELDS:
        base_values = [str(item) for item in (merged.get(field) or []) if str(item).strip()]
        incoming_values = [str(item) for item in (incoming.get(field) or []) if str(item).strip()]
        if prefer_incoming:
            ordered = incoming_values + [item for item in base_values if item not in incoming_values]
        else:
            ordered = base_values + [item for item in incoming_values if item not in base_values]
        merged[field] = ordered

    for field in BOOL_FIELDS:
        merged[field] = bool(merged.get(field)) or bool(incoming.get(field))

    for field in INT_FIELDS:
        base_val = int(merged.get(field, 0) or 0)
        incoming_val = int(incoming.get(field, 0) or 0)
        if base_val == 0 and incoming_val:
            merged[field] = incoming_val

    if merged.get("status") != "confirmed" and incoming.get("status") == "confirmed":
        merged["status"] = "confirmed"

    if prefer_incoming and incoming.get("updated_at"):
        merged["updated_at"] = incoming["updated_at"]

    return strip_storage_fields(prepare_record_for_storage(merged)), conflict


def dedupe_dataset_records(
    records: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    grouped: dict[tuple[str, int], list[dict[str, Any]]] = {}
    unique_records: list[dict[str, Any]] = []
    duplicate_groups = 0
    duplicate_records = 0
    conflicts = 0

    for record in records:
        key = canonical_identity(record)
        if key[0] and key[1]:
            grouped.setdefault(key, []).append(apply_dataset_defaults(record))
        else:
            unique_records.append(strip_storage_fields(prepare_record_for_storage(record)))

    deduped: list[dict[str, Any]] = list(unique_records)
    for group in grouped.values():
        if len(group) > 1:
            duplicate_groups += 1
            duplicate_records += len(group) - 1
        ordered = sorted(
            group,
            key=lambda item: (
                record_richness_score(item),
                _parse_timestamp(item.get("updated_at")),
                str(item.get("id", "")),
            ),
            reverse=True,
        )
        merged = ordered[0]
        for candidate in ordered[1:]:
            merged, had_conflict = merge_records_for_sync(merged, candidate)
            if had_conflict:
                conflicts += 1
        deduped.append(strip_storage_fields(prepare_record_for_storage(merged)))

    report = {
        "duplicate_groups": duplicate_groups,
        "duplicate_records": duplicate_records,
        "conflicts": conflicts,
    }
    return deduped, report


def normalize_glossary_terms(terms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[tuple[str, str], dict[str, Any]] = {}

    for raw_term in terms:
        term = dict(raw_term)
        term_zh = str(term.get("term_zh", "") or "").strip()
        if not term_zh:
            continue

        book = str(term.get("book", "") or term.get("domain", "") or "").strip()
        term["book"] = book
        term["domain"] = str(term.get("domain", "") or book).strip()
        term["term_ko"] = str(term.get("term_ko", "") or "").strip()
        term["term_meaning_ko"] = str(term.get("term_meaning_ko", "") or "").strip()
        term["pos"] = str(term.get("pos", "") or "").strip()
        term["policy"] = str(term.get("policy", "") or "").strip()
        term["notes"] = str(term.get("notes", "") or "").strip()

        key = (term_zh, book.lower())
        existing = deduped.get(key)
        if not existing:
            deduped[key] = term
            continue

        candidate = existing
        if len(term["term_ko"]) > len(str(existing.get("term_ko", ""))):
            candidate = dict(existing)
            candidate["term_ko"] = term["term_ko"]
        if len(term["term_meaning_ko"]) > len(str(candidate.get("term_meaning_ko", ""))):
            candidate = dict(candidate)
            candidate["term_meaning_ko"] = term["term_meaning_ko"]
        for field in ("pos", "policy", "notes", "domain", "book"):
            if not str(candidate.get(field, "")).strip() and str(term.get(field, "")).strip():
                candidate[field] = term[field]
        deduped[key] = candidate

    return sorted(
        deduped.values(),
        key=lambda item: (
            str(item.get("book", "")).lower(),
            str(item.get("term_zh", "")).lower(),
        ),
    )


def sync_root_glossary_to_canonical() -> dict[str, Any]:
    root_path = get_root_glossary_path()
    canonical_path = get_glossary_path()

    root_terms = []
    if root_path.exists():
        root_terms = json.loads(root_path.read_text(encoding="utf-8"))

    normalized = normalize_glossary_terms(root_terms)
    canonical_path.parent.mkdir(parents=True, exist_ok=True)
    canonical_path.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "root_path": str(root_path),
        "canonical_path": str(canonical_path),
        "root_terms": len(root_terms),
        "canonical_terms": len(normalized),
        "duplicates_removed": max(0, len(root_terms) - len(normalized)),
    }


def load_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))
