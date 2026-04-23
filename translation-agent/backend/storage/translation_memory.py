"""Helpers for building translation-memory context from confirmed dataset rows."""

from __future__ import annotations

import re
from itertools import zip_longest
from typing import Any


def _confirmed_ko_text(record: dict[str, Any]) -> str:
    return str(record.get("ko_text_confirmed") or record.get("ko_text") or "").strip()


def _is_confirmed_parallel_record(record: dict[str, Any]) -> bool:
    return (
        str(record.get("status", "")).strip() == "confirmed"
        and bool(str(record.get("zh_text", "")).strip())
        and bool(_confirmed_ko_text(record))
    )


def get_confirmed_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    confirmed = [record for record in records if _is_confirmed_parallel_record(record)]
    return sorted(
        confirmed,
        key=lambda item: (
            int(item.get("chapter_ko", 0) or 0),
            str(item.get("id", "")),
        ),
    )


def _normalize_chunks(text: str) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", text).strip()
    if not normalized:
        return []

    blocks = [block.strip() for block in re.split(r"\n\s*\n", normalized) if block.strip()]
    if len(blocks) >= 2:
        return blocks

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if len(lines) >= 3:
        chunks: list[str] = []
        bucket: list[str] = []
        for line in lines:
            bucket.append(line)
            if len(bucket) >= 2:
                chunks.append("\n".join(bucket).strip())
                bucket = []
        if bucket:
            chunks.append("\n".join(bucket).strip())
        return chunks

    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[。！？!?])\s+|(?<=\.)\s+", normalized)
        if sentence.strip()
    ]
    if len(sentences) >= 2:
        chunks: list[str] = []
        current = ""
        for sentence in sentences:
            candidate = f"{current} {sentence}".strip()
            if current and len(candidate) > 220:
                chunks.append(current)
                current = sentence
            else:
                current = candidate
        if current:
            chunks.append(current)
        return chunks

    return [normalized]


def _excerpt(text: str, *, center_term: str = "", max_chars: int = 220) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    if center_term and center_term in cleaned:
        index = cleaned.find(center_term)
        half = max_chars // 2
        start = max(0, index - half)
        end = min(len(cleaned), start + max_chars)
        if end - start < max_chars:
            start = max(0, end - max_chars)
        snippet = cleaned[start:end].strip()
        if start > 0:
            snippet = f"...{snippet}"
        if end < len(cleaned):
            snippet = f"{snippet}..."
        return snippet
    return f"{cleaned[: max_chars - 3].rstrip()}..."


def _split_sentence_units(text: str) -> list[str]:
    normalized = re.sub(r"\r\n?", "\n", str(text or "")).strip()
    if not normalized:
        return []
    normalized = re.sub(r"(?<=[。！？!?…])\s*", "\n", normalized)
    normalized = re.sub(r"(?<=\.)\s+", "\n", normalized)
    return [chunk.strip() for chunk in normalized.splitlines() if chunk.strip()]


def _build_parallel_units(record: dict[str, Any]) -> list[tuple[str, str]]:
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
            source = str(raw_row.get("source_text", "") or "").strip()
            translation = str(raw_row.get("translation_text", "") or "").strip()
            if source or translation:
                rows.append((source, translation))
        if rows:
            return rows

    zh_units = _split_sentence_units(str(record.get("zh_text", "") or ""))
    ko_units = _split_sentence_units(_confirmed_ko_text(record))
    rows: list[tuple[str, str]] = []
    for zh_unit, ko_unit in zip_longest(zh_units, ko_units, fillvalue=""):
        source = str(zh_unit or "").strip()
        translation = str(ko_unit or "").strip()
        if source or translation:
            rows.append((source, translation))
    return rows


def _windowed_units(rows: list[tuple[str, str]], anchor_index: int, *, radius: int = 1) -> tuple[str, str]:
    if not rows:
        return "", ""
    start = max(0, anchor_index - radius)
    end = min(len(rows), anchor_index + radius + 1)
    window = rows[start:end]
    zh_snippet = "\n".join(source for source, _ in window if source).strip()
    ko_snippet = "\n".join(translation for _, translation in window if translation).strip()
    return zh_snippet, ko_snippet


def build_glossary_hits(
    glossary_terms: list[dict[str, Any]],
    source_text: str,
    *,
    book: str | None = None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    source = source_text.strip()
    if not source:
        return []

    best_hits: dict[str, dict[str, Any]] = {}
    normalized_book = (book or "").strip()

    for term in glossary_terms:
        term_zh = str(term.get("term_zh", "") or "").strip()
        if not term_zh or term_zh not in source:
            continue

        term_book = str(term.get("book", "") or term.get("domain", "") or "").strip()
        scope = "book" if normalized_book and term_book == normalized_book else "global"
        candidate = {
            "term_zh": term_zh,
            "term_ko": str(term.get("term_ko", "") or "").strip(),
            "policy": str(term.get("policy", "") or "").strip(),
            "pos": str(term.get("pos", "") or "").strip(),
            "book": term_book,
            "scope": scope,
            "notes": str(term.get("notes", "") or "").strip(),
            "source_chapter": term.get("source_chapter"),
        }
        existing = best_hits.get(term_zh)
        if existing is None:
            best_hits[term_zh] = candidate
            continue
        existing_priority = 0 if existing["scope"] == "book" else 1
        candidate_priority = 0 if candidate["scope"] == "book" else 1
        if candidate_priority < existing_priority:
            best_hits[term_zh] = candidate
            continue
        if candidate_priority == existing_priority and len(candidate["term_ko"]) > len(existing["term_ko"]):
            best_hits[term_zh] = candidate

    hits = list(best_hits.values())
    hits.sort(
        key=lambda item: (
            0 if item["scope"] == "book" else 1,
            -len(item["term_zh"]),
            item["term_zh"],
        )
    )
    return hits[:limit]


def _char_bigrams(text: str) -> set[str]:
    compact = re.sub(r"\s+", "", text)
    if len(compact) < 2:
        return {compact} if compact else set()
    return {compact[index:index + 2] for index in range(len(compact) - 1)}


def _score_record(
    query_text: str,
    record: dict[str, Any],
    glossary_hits: list[dict[str, Any]],
) -> tuple[int, list[str]]:
    zh_text = str(record.get("zh_text", "") or "").strip()
    if not zh_text:
        return 0, []

    query_bigrams = _char_bigrams(query_text)
    record_bigrams = _char_bigrams(zh_text)
    overlap = len(query_bigrams.intersection(record_bigrams))
    matched_terms = [
        hit["term_zh"]
        for hit in glossary_hits
        if hit["term_zh"] and hit["term_zh"] in zh_text
    ]
    score = overlap + (len(matched_terms) * 5)
    return score, matched_terms


def _record_excerpt(record: dict[str, Any], matched_terms: list[str]) -> tuple[str, str]:
    zh_text = str(record.get("zh_text", "") or "").strip()
    ko_text = _confirmed_ko_text(record)
    focus_term = matched_terms[0] if matched_terms else ""
    return _excerpt(zh_text, center_term=focus_term), _excerpt(ko_text, max_chars=220)


def build_reference_examples(
    records: list[dict[str, Any]],
    source_text: str,
    glossary_hits: list[dict[str, Any]],
    *,
    prev_record_id: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    confirmed = get_confirmed_records(records)
    if not confirmed:
        return []

    examples: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    def push(record: dict[str, Any], source: str, matched_terms: list[str]) -> bool:
        record_id = str(record.get("id", "") or "").strip()
        if not record_id or record_id in seen_ids or len(examples) >= limit:
            return False
        zh_snippet, ko_snippet = _record_excerpt(record, matched_terms)
        examples.append(
            {
                "record_id": record_id,
                "book": str(record.get("book", "") or "").strip(),
                "chapter_ko": int(record.get("chapter_ko", 0) or 0),
                "chapter_zh": str(record.get("chapter_zh", "") or "").strip(),
                "source": source,
                "matched_terms": matched_terms,
                "zh_snippet": zh_snippet,
                "ko_snippet": ko_snippet,
            }
        )
        seen_ids.add(record_id)
        return True

    if prev_record_id:
        previous = next((record for record in confirmed if str(record.get("id", "")) == prev_record_id), None)
        if previous:
            push(previous, "previous", [])

    for hit in glossary_hits:
        if len(examples) >= limit:
            break
        for record in confirmed:
            if hit["term_zh"] in str(record.get("zh_text", "") or ""):
                if push(record, "term", [hit["term_zh"]]):
                    break

    scored: list[tuple[int, dict[str, Any], list[str]]] = []
    for record in confirmed:
        score, matched_terms = _score_record(source_text, record, glossary_hits)
        if score > 0:
            scored.append((score, record, matched_terms))

    scored.sort(
        key=lambda item: (
            -item[0],
            -int(item[1].get("chapter_ko", 0) or 0),
            str(item[1].get("id", "")),
        )
    )
    for _, record, matched_terms in scored:
        if len(examples) >= limit:
            break
        push(record, "similar", matched_terms)

    for record in reversed(confirmed):
        if len(examples) >= limit:
            break
        push(record, "recent", [])

    return examples


def build_prompt_glossary_table(glossary_hits: list[dict[str, Any]]) -> str:
    if not glossary_hits:
        return "직접 적용할 용어 히트 없음"
    lines = [
        "| 중국어 | 고정 한국어 | 범위 | 정책 | 비고 |",
        "|--------|-------------|------|------|------|",
    ]
    for hit in glossary_hits:
        lines.append(
            f"| {hit['term_zh']} | {hit['term_ko'] or '-'} | {hit['scope']} | "
            f"{hit['policy'] or '-'} | {hit['notes'] or '-'} |"
        )
    return "\n".join(lines)


def build_prompt_reference_examples(examples: list[dict[str, Any]]) -> str:
    if not examples:
        return "참고할 확정 예문 없음"

    blocks: list[str] = []
    for index, example in enumerate(examples, start=1):
        matched = ", ".join(example.get("matched_terms", [])) or "-"
        blocks.append(
            "\n".join(
                [
                    f"[예문 {index}] source={example['source']} ch_ko={example['chapter_ko']} ch_zh={example['chapter_zh']} matched={matched}",
                    f"ZH: {example['zh_snippet']}",
                    f"KO: {example['ko_snippet']}",
                ]
            )
        )
    return "\n\n".join(blocks)


def build_term_examples(
    records: list[dict[str, Any]],
    *,
    term_zh: str,
    term_ko: str = "",
    limit: int = 6,
) -> list[dict[str, Any]]:
    confirmed = get_confirmed_records(records)
    if not confirmed or not term_zh.strip():
        return []

    term_zh = term_zh.strip()
    term_ko = term_ko.strip()
    examples: list[dict[str, Any]] = []

    for record in reversed(confirmed):
        rows = _build_parallel_units(record)
        matched_index = -1
        matched_in = ""

        for index, (source_text, translation_text) in enumerate(rows):
            zh_match = term_zh in source_text
            ko_match = bool(term_ko) and term_ko in translation_text
            if not zh_match and not ko_match:
                continue
            matched_index = index
            matched_in = "both" if zh_match and ko_match else "zh" if zh_match else "ko"
            break

        if matched_index < 0:
            continue

        zh_snippet, ko_snippet = _windowed_units(rows, matched_index, radius=1)
        examples.append(
            {
                "record_id": str(record.get("id", "") or "").strip(),
                "book": str(record.get("book", "") or "").strip(),
                "chapter_ko": int(record.get("chapter_ko", 0) or 0),
                "chapter_zh": str(record.get("chapter_zh", "") or "").strip(),
                "matched_in": matched_in,
                "zh_snippet": zh_snippet,
                "ko_snippet": ko_snippet,
            }
        )
        if len(examples) >= limit:
            break

    return examples
