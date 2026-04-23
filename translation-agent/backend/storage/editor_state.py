"""Structured editor state embedded inside dataset notes."""

from __future__ import annotations

import json
import re
from typing import Any

EDITOR_STATE_BEGIN = "[codex-editor-state:v1]"
EDITOR_STATE_END = "[/codex-editor-state]"
EDITOR_STATE_RE = re.compile(
    rf"(?:\n)?{re.escape(EDITOR_STATE_BEGIN)}\n(.*?)\n{re.escape(EDITOR_STATE_END)}(?:\n)?",
    re.DOTALL,
)


def _normalize_index_list(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    indexes: list[int] = []
    seen: set[int] = set()
    for item in value:
        try:
            index = int(item)
        except (TypeError, ValueError):
            continue
        if index < 0 or index in seen:
            continue
        seen.add(index)
        indexes.append(index)
    return indexes


def normalize_alignment_rows(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    rows: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        source_text = str(
            item.get("source_text", item.get("sourceSentence", item.get("source") or ""))
        ).replace("\r\n", "\n").replace("\r", "\n").strip()
        translation_text = str(
            item.get(
                "translation_text",
                item.get("translationSentence", item.get("translation") or ""),
            )
        ).replace("\r\n", "\n").replace("\r", "\n").strip()
        row_id = str(item.get("id") or f"row-{index + 1}").strip() or f"row-{index + 1}"
        origin = str(item.get("origin") or "manual").strip() or "manual"
        row: dict[str, Any] = {
            "id": row_id,
            "order": index,
            "source_text": source_text,
            "translation_text": translation_text,
            "locked": bool(item.get("locked", False)),
            "origin": origin,
        }
        source_indexes = _normalize_index_list(item.get("source_indexes"))
        if source_indexes:
            row["source_indexes"] = source_indexes
        translation_indexes = _normalize_index_list(item.get("translation_indexes"))
        if translation_indexes:
            row["translation_indexes"] = translation_indexes
        rows.append(row)
    return rows


def _normalize_verify_categories(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    categories: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        category_id = str(item.get("id") or "").strip()
        label = str(item.get("label") or "").strip()
        if not category_id and not label:
            continue
        try:
            score = int(round(float(item.get("score", 0))))
        except (TypeError, ValueError):
            score = 0
        categories.append(
            {
                "id": category_id or "misc",
                "label": label or category_id or "misc",
                "score": max(0, min(score, 100)),
                "status": str(item.get("status") or "warning").strip() or "warning",
                "comment": str(item.get("comment") or "").strip(),
            }
        )
    return categories


def _normalize_verify_issues(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    issues: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        problem = str(item.get("problem") or "").strip()
        if not problem:
            continue
        issues.append(
            {
                "severity": str(item.get("severity") or "minor").strip() or "minor",
                "category": str(item.get("category") or "accuracy").strip() or "accuracy",
                "source_excerpt": str(item.get("source_excerpt") or "").strip(),
                "translation_excerpt": str(item.get("translation_excerpt") or "").strip(),
                "problem": problem,
                "suggestion": str(item.get("suggestion") or "").strip(),
            }
        )
    return issues


def normalize_verify_reports(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    reports: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        try:
            overall_score = int(round(float(item.get("overall_score", 0))))
        except (TypeError, ValueError):
            overall_score = 0
        report_id = str(item.get("id") or f"verify-{index + 1}").strip() or f"verify-{index + 1}"
        created_at = str(item.get("created_at") or "").strip()
        if not created_at:
            continue
        reports.append(
            {
                "id": report_id,
                "created_at": created_at,
                "overall_score": max(0, min(overall_score, 100)),
                "verdict": str(item.get("verdict") or "needs_minor_revision").strip() or "needs_minor_revision",
                "summary": str(item.get("summary") or "").strip(),
                "categories": _normalize_verify_categories(item.get("categories")),
                "issues": _normalize_verify_issues(item.get("issues")),
                "strengths": [
                    str(strength).strip()
                    for strength in (item.get("strengths") or [])
                    if str(strength).strip()
                ],
                "model": str(item.get("model") or "").strip(),
            }
        )
    return reports


def extract_editor_state(notes: str) -> tuple[str, dict[str, Any]]:
    raw_notes = str(notes or "")
    matches = list(EDITOR_STATE_RE.finditer(raw_notes))
    if not matches:
        return raw_notes.strip(), {}

    state: dict[str, Any] = {}
    last_match = matches[-1]
    try:
        parsed = json.loads((last_match.group(1) or "").strip())
        if isinstance(parsed, dict):
            state = parsed
    except Exception:
        state = {}

    clean_notes = f"{raw_notes[:last_match.start()]}{raw_notes[last_match.end():]}".strip()
    return clean_notes, state


def embed_editor_state(notes: str, *, alignment_rows: Any = None, verify_reports: Any = None) -> str:
    clean_notes, _ = extract_editor_state(notes)
    normalized_rows = normalize_alignment_rows(alignment_rows)
    normalized_reports = normalize_verify_reports(verify_reports)
    if not normalized_rows and not normalized_reports:
        return clean_notes

    state: dict[str, Any] = {}
    if normalized_rows:
        state["alignment_rows"] = normalized_rows
    if normalized_reports:
        state["verify_reports"] = normalized_reports
    block = "\n".join(
        [
            EDITOR_STATE_BEGIN,
            json.dumps(state, ensure_ascii=False, separators=(",", ":")),
            EDITOR_STATE_END,
        ]
    )
    if clean_notes:
        return f"{clean_notes}\n{block}".strip()
    return block


def hydrate_record_editor_state(record: dict[str, Any]) -> dict[str, Any]:
    hydrated = dict(record)
    clean_notes, state = extract_editor_state(str(record.get("notes", "")))
    hydrated["notes"] = clean_notes
    hydrated["alignment_rows"] = normalize_alignment_rows(state.get("alignment_rows", []))
    hydrated["verify_reports"] = normalize_verify_reports(state.get("verify_reports", []))
    return hydrated


def dehydrate_record_editor_state(record: dict[str, Any]) -> dict[str, Any]:
    dehydrated = dict(record)
    has_alignment_rows = "alignment_rows" in dehydrated
    has_verify_reports = "verify_reports" in dehydrated
    if not has_alignment_rows and not has_verify_reports:
        return dehydrated
    alignment_rows = dehydrated.pop("alignment_rows", [])
    verify_reports = dehydrated.pop("verify_reports", [])
    dehydrated["notes"] = embed_editor_state(
        str(record.get("notes", "")),
        alignment_rows=alignment_rows,
        verify_reports=verify_reports,
    )
    return dehydrated
