"""Glossary storage helpers and canonicalization."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from itertools import zip_longest
from pathlib import Path
from typing import Any

from backend.storage.config import get_dataset_path, get_glossary_path, get_root_glossary_path
from backend.storage.dataset_utils import normalize_book_key

_TERM_KO_ANNOTATION_PATTERN = re.compile(
    r"(?P<term_ko>[가-힣A-Za-z][가-힣A-Za-z0-9·ㆍ\-]{1,29})\((?P<term_zh>[\u3400-\u4dbf\u4e00-\u9fff]{2,24})\)"
)
_AUTO_INFERENCE_NOTE = "예문 병기 자동 추정"
_AUTO_MEANING_NOTE = "원문 뜻 자동 추정"


def _atomic_write_json(path: Path, payload: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temp_path.replace(path)


def normalize_glossary_term(term: dict[str, Any]) -> dict[str, Any]:
    book = str(term.get("book") or term.get("domain") or "").strip()
    domain = str(term.get("domain") or book).strip()
    source_chapter_raw = term.get("source_chapter")
    source_chapter = None
    if source_chapter_raw not in (None, ""):
        try:
            source_chapter = int(source_chapter_raw)
        except (TypeError, ValueError):
            source_chapter = None

    return {
        "term_zh": str(term.get("term_zh", "")).strip(),
        "term_ko": str(term.get("term_ko", "")).strip(),
        "term_meaning_ko": str(term.get("term_meaning_ko", "")).strip(),
        "pos": str(term.get("pos", "")).strip(),
        "domain": domain,
        "policy": str(term.get("policy", "")).strip(),
        "notes": str(term.get("notes", "")).strip(),
        "book": book,
        "added_at": term.get("added_at"),
        "source_chapter": source_chapter,
    }


def _dataset_record_book_key(record: dict[str, Any]) -> str:
    return normalize_book_key(
        str(record.get("book_zh", "") or ""),
        str(record.get("book_ko", "") or record.get("book", "") or ""),
        str(record.get("book", "") or ""),
    )


def _glossary_term_book_key(term: dict[str, Any]) -> str:
    scope = str(term.get("book") or term.get("domain") or "").strip()
    return normalize_book_key("", scope, scope)


def _append_note_tag(notes: str, tag: str) -> str:
    cleaned = str(notes or "").strip()
    if not tag:
        return cleaned
    if tag in cleaned:
        return cleaned
    if not cleaned:
        return tag
    return f"{cleaned} · {tag}"


def _build_term_ko_index(records: list[dict[str, Any]]) -> dict[tuple[str, str], Counter[str]]:
    index: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)

    for record in records:
        ko_text = str(record.get("ko_text_confirmed") or record.get("ko_text") or "").strip()
        if not ko_text:
            continue

        book_key = _dataset_record_book_key(record)
        seen_pairs: set[tuple[str, str]] = set()

        for match in _TERM_KO_ANNOTATION_PATTERN.finditer(ko_text):
            term_zh = match.group("term_zh").strip()
            term_ko = match.group("term_ko").strip()
            if not term_zh or not term_ko or not re.search(r"[가-힣]", term_ko):
                continue

            pair = (term_zh, term_ko)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            index[(book_key, term_zh)][term_ko] += 1
            index[("", term_zh)][term_ko] += 1

    return dict(index)


def _pick_best_counter_value(counter: Counter[str] | None) -> str:
    if not counter:
        return ""

    most_common = counter.most_common(2)
    if len(most_common) == 1:
        return most_common[0][0]

    best_term, best_count = most_common[0]
    second_count = most_common[1][1]
    if best_count > second_count:
        return best_term

    return ""


def _split_sentence_units(text: str) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", str(text or "")).strip()
    if not normalized:
        return []
    normalized = re.sub(r"(?<=[。！？!?…])\s*", "\n", normalized)
    normalized = re.sub(r"(?<=\.)\s+", "\n", normalized)
    return [chunk.strip() for chunk in normalized.splitlines() if chunk.strip()]


def _record_parallel_units(record: dict[str, Any]) -> list[tuple[str, str]]:
    alignment_rows = record.get("alignment_rows")
    if isinstance(alignment_rows, list):
        rows: list[tuple[str, str]] = []
        for raw_row in sorted(
            alignment_rows,
            key=lambda item: (
                int(item.get("order", 0) or 0) if isinstance(item, dict) else 0,
                str(item.get("id", "") or "") if isinstance(item, dict) else "",
            ),
        ):
            if not isinstance(raw_row, dict):
                continue
            source_text = str(raw_row.get("source_text", "") or "").strip()
            translation_text = str(raw_row.get("translation_text", "") or "").strip()
            if source_text or translation_text:
                rows.append((source_text, translation_text))
        if rows:
            return rows

    zh_units = _split_sentence_units(str(record.get("zh_text", "") or ""))
    ko_units = _split_sentence_units(str(record.get("ko_text_confirmed") or record.get("ko_text") or ""))
    rows: list[tuple[str, str]] = []
    for zh_unit, ko_unit in zip_longest(zh_units, ko_units, fillvalue=""):
        source_text = str(zh_unit or "").strip()
        translation_text = str(ko_unit or "").strip()
        if source_text or translation_text:
            rows.append((source_text, translation_text))
    return rows


def _trim_meaning_candidate(text: str, *, max_chars: int = 40) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip(" \t\r\n\"'“”‘’[]()")
    if not cleaned:
        return ""
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[: max_chars - 1].rstrip()}…"


def _infer_term_meaning_candidate(translation_text: str, *, term_ko: str = "") -> str:
    normalized_term_ko = str(term_ko or "").strip()
    if normalized_term_ko:
        return normalized_term_ko

    cleaned = _trim_meaning_candidate(translation_text, max_chars=80)
    if not cleaned:
        return ""

    clauses = [
        _trim_meaning_candidate(fragment, max_chars=40)
        for fragment in re.split(r"[，,、；;：:\n]+", cleaned)
        if _trim_meaning_candidate(fragment, max_chars=40)
    ]
    if not clauses:
        return cleaned
    clauses.sort(key=lambda item: (len(item), item))
    return clauses[0]


def infer_term_ko_from_records(
    term_zh: str,
    *,
    book: str = "",
    domain: str = "",
    records: list[dict[str, Any]],
) -> str:
    term_zh_clean = str(term_zh or "").strip()
    if not term_zh_clean:
        return ""
    return infer_term_ko_from_index(
        term_zh_clean,
        book=book,
        domain=domain,
        index=_build_term_ko_index(records),
    )


def infer_term_ko_from_index(
    term_zh: str,
    *,
    book: str = "",
    domain: str = "",
    index: dict[tuple[str, str], Counter[str]],
) -> str:
    term_zh_clean = str(term_zh or "").strip()
    if not term_zh_clean:
        return ""

    scope_key = normalize_book_key("", book or domain, book or domain)
    if scope_key:
        scoped_counter = index.get((scope_key, term_zh_clean))
        scoped_candidate = _pick_best_counter_value(scoped_counter)
        if scoped_candidate:
            return scoped_candidate
        if scoped_counter:
            return ""

    return _pick_best_counter_value(index.get(("", term_zh_clean)))


def infer_term_meaning_from_records(
    term_zh: str,
    *,
    term_ko: str = "",
    book: str = "",
    domain: str = "",
    records: list[dict[str, Any]],
) -> str:
    term_zh_clean = str(term_zh or "").strip()
    if not term_zh_clean:
        return ""

    scope_key = normalize_book_key("", book or domain, book or domain)
    scoped_counter: Counter[str] = Counter()
    global_counter: Counter[str] = Counter()

    for record in records:
        record_book_key = _dataset_record_book_key(record)
        for source_text, translation_text in _record_parallel_units(record):
            if term_zh_clean not in source_text:
                continue
            candidate = _infer_term_meaning_candidate(translation_text, term_ko=term_ko)
            if not candidate:
                continue
            global_counter[candidate] += 1
            if scope_key and record_book_key == scope_key:
                scoped_counter[candidate] += 1

    if scope_key:
        scoped_candidate = _pick_best_counter_value(scoped_counter)
        if scoped_candidate:
            return scoped_candidate
        if scoped_counter:
            return ""

    return _pick_best_counter_value(global_counter)


def backfill_glossary_term_meanings(
    terms: list[dict[str, Any]],
    records: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    index = _build_term_ko_index(records)
    updated_count = 0
    updated_terms: list[dict[str, Any]] = []

    for raw_term in terms:
        term = normalize_glossary_term(raw_term)
        updated = False

        if not term["term_ko"]:
            inferred = infer_term_ko_from_index(
                term["term_zh"],
                book=term["book"],
                domain=term["domain"],
                index=index,
            )
            if inferred:
                term["term_ko"] = inferred
                term["notes"] = _append_note_tag(term.get("notes", ""), _AUTO_INFERENCE_NOTE)
                updated = True

        if not term["term_meaning_ko"]:
            inferred_meaning = infer_term_meaning_from_records(
                term["term_zh"],
                term_ko=term["term_ko"],
                book=term["book"],
                domain=term["domain"],
                records=records,
            )
            if inferred_meaning:
                term["term_meaning_ko"] = inferred_meaning
                term["notes"] = _append_note_tag(term.get("notes", ""), _AUTO_MEANING_NOTE)
                updated = True

        if updated:
            updated_count += 1
        updated_terms.append(term)

    return updated_terms, updated_count


def load_glossary_inference_records(dataset_path: Path | None = None) -> list[dict[str, Any]]:
    path = dataset_path or get_dataset_path()
    if not path.exists():
        return []

    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []

    for line in lines:
        raw = line.strip()
        if not raw:
            continue
        try:
            records.append(json.loads(raw))
        except json.JSONDecodeError:
            continue

    return records


def sync_missing_term_meanings(dataset_path: Path | None = None) -> int:
    records = load_glossary_inference_records(dataset_path)
    if not records:
        return 0

    terms = load_glossary()
    updated_terms, updated_count = backfill_glossary_term_meanings(terms, records)
    if updated_count > 0:
        save_glossary(updated_terms)
    return updated_count


def dedupe_glossary_terms(terms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    ordered_keys: list[tuple[str, str]] = []

    for raw_term in terms:
        term = normalize_glossary_term(raw_term)
        term_zh = term["term_zh"]
        if not term_zh:
            continue

        canonical_book = _glossary_term_book_key(term)
        key = (term_zh, canonical_book)
        if key not in deduped:
            deduped[key] = term
            ordered_keys.append(key)
            continue

        existing = deduped[key]
        for field in ("term_ko", "term_meaning_ko", "pos", "domain", "policy", "notes", "book", "added_at"):
            if not existing.get(field) and term.get(field):
                existing[field] = term[field]
        if existing.get("source_chapter") in (None, "") and term.get("source_chapter") not in (None, ""):
            existing["source_chapter"] = term["source_chapter"]

    return [deduped[key] for key in ordered_keys]


def ensure_canonical_glossary() -> Path:
    canonical_path = get_glossary_path()
    root_path = get_root_glossary_path()

    canonical_terms: list[dict[str, Any]] = []
    if canonical_path.exists():
        try:
            canonical_terms = json.loads(canonical_path.read_text(encoding="utf-8") or "[]")
        except json.JSONDecodeError:
            canonical_terms = []

    if canonical_terms:
        normalized = dedupe_glossary_terms(canonical_terms)
        if normalized != canonical_terms:
            _atomic_write_json(canonical_path, normalized)
        return canonical_path

    if root_path.exists():
        try:
            root_terms = json.loads(root_path.read_text(encoding="utf-8") or "[]")
        except json.JSONDecodeError:
            root_terms = []
        normalized_root = dedupe_glossary_terms(root_terms)
        _atomic_write_json(canonical_path, normalized_root)
        return canonical_path

    canonical_path.parent.mkdir(parents=True, exist_ok=True)
    if not canonical_path.exists():
        _atomic_write_json(canonical_path, [])
    return canonical_path


def load_glossary() -> list[dict[str, Any]]:
    path = ensure_canonical_glossary()
    try:
        payload = json.loads(path.read_text(encoding="utf-8") or "[]")
    except json.JSONDecodeError:
        payload = []
    normalized = dedupe_glossary_terms(payload)
    if normalized != payload:
        _atomic_write_json(path, normalized)
    return normalized


def save_glossary(terms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = dedupe_glossary_terms(terms)
    _atomic_write_json(ensure_canonical_glossary(), normalized)
    return normalized


def count_glossary_terms() -> int:
    return len(load_glossary())
