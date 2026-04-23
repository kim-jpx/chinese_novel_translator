"""Batch chapter-alignment helpers for source-chapter-based KO resegmentation."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any, Callable


CleanerFn = Callable[[str, str], str]
SplitterFn = Callable[[str, str], tuple[str, str, str]]
AlignerFn = Callable[[str, str], tuple[str, str]]


@dataclass
class ChapterAlignmentDecision:
    record_id: str
    book: str
    chapter_ko: int
    chapter_zh: str
    existing_ko_text: str
    proposed_ko_text: str
    confidence: float
    auto_applied: bool
    warnings: list[str] = field(default_factory=list)
    start_reason: str = ""
    end_reason: str = ""


def _chapter_zh_primary(record: dict[str, Any]) -> int:
    raw = str(record.get("chapter_zh", "") or "").strip()
    numbers = [int(value) for value in re.findall(r"\d+", raw)]
    if numbers:
        return numbers[0]
    return int(record.get("chapter_ko", 0) or 0)


def build_ko_pool(records: list[dict[str, Any]], cleaner: CleanerFn) -> str:
    ordered = sorted(records, key=lambda item: (_chapter_zh_primary(item), int(item.get("chapter_ko", 0) or 0)))
    chunks = [
        cleaner(str(record.get("ko_text", "") or ""), "ko")
        for record in ordered
        if cleaner(str(record.get("ko_text", "") or ""), "ko")
    ]
    return cleaner("\n".join(chunks), "ko")


def _split_text_units(text: str) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) >= 2:
        return lines

    collapsed = text.strip()
    if not collapsed:
        return []

    sentence_units = [
        chunk.strip()
        for chunk in re.split(r"(?<=[.!?。！？…])\s+|(?<=[.!?。！？…])(?=[^\s])", collapsed)
        if chunk.strip()
    ]
    if len(sentence_units) >= 2:
        return sentence_units

    return [collapsed]


def _split_longest_unit(units: list[str]) -> list[str]:
    if not units:
        return units
    index = max(range(len(units)), key=lambda item: len(units[item]))
    target = units[index]
    if len(target) < 120:
        return units

    midpoint = len(target) // 2
    split_candidates = [match.start() + 1 for match in re.finditer(r"[.!?。！？…]", target)]
    split_at = min(split_candidates, key=lambda value: abs(value - midpoint), default=midpoint)
    left = target[:split_at].strip()
    right = target[split_at:].strip()
    if not left or not right:
        left = target[:midpoint].strip()
        right = target[midpoint:].strip()
    if not left or not right:
        return units
    return units[:index] + [left, right] + units[index + 1 :]


def _ensure_minimum_units(units: list[str], minimum: int) -> list[str]:
    normalized = list(units)
    attempts = 0
    while len(normalized) < minimum and attempts < minimum * 4:
        next_units = _split_longest_unit(normalized)
        if next_units == normalized:
            break
        normalized = next_units
        attempts += 1
    return normalized


def _join_units(units: list[str]) -> str:
    return "\n".join(unit.strip() for unit in units if unit.strip()).strip()


def _prefix_unit_lengths(units: list[str]) -> list[int]:
    prefix = [0]
    running = 0
    for unit in units:
        running += len(unit)
        prefix.append(running)
    return prefix


def _plan_global_boundaries(
    zh_lengths: list[int],
    ko_units: list[str],
) -> list[int]:
    chapter_count = len(zh_lengths)
    unit_count = len(ko_units)
    if chapter_count == 0 or unit_count == 0:
        return []
    if chapter_count == 1:
        return [unit_count]

    prefix = _prefix_unit_lengths(ko_units)
    total_zh = max(sum(zh_lengths), 1)
    total_ko = max(prefix[-1], 1)

    target_cumulative = []
    running_zh = 0
    for length in zh_lengths[:-1]:
        running_zh += length
        target_cumulative.append((running_zh / total_zh) * total_ko)

    inf = float("inf")
    dp = [[inf] * (unit_count + 1) for _ in range(chapter_count)]
    prev_choice = [[-1] * (unit_count + 1) for _ in range(chapter_count)]

    for end in range(1, unit_count - chapter_count + 2):
        expected = total_ko * (zh_lengths[0] / total_zh)
        actual = prefix[end]
        cost = abs(actual - expected) / total_ko
        cost += abs(actual - target_cumulative[0]) / total_ko
        if actual < max(40, expected * 0.25):
            cost += 0.25
        dp[0][end] = cost

    for chapter_index in range(1, chapter_count - 1):
        expected = total_ko * (zh_lengths[chapter_index] / total_zh)
        min_end = chapter_index + 1
        max_end = unit_count - (chapter_count - chapter_index - 1)
        for end in range(min_end, max_end + 1):
            target = target_cumulative[chapter_index]
            for previous_end in range(chapter_index, end):
                previous_cost = dp[chapter_index - 1][previous_end]
                if previous_cost == inf:
                    continue
                segment_chars = prefix[end] - prefix[previous_end]
                cost = previous_cost
                cost += abs(prefix[end] - target) / total_ko
                cost += abs(segment_chars - expected) / total_ko * 0.65
                if segment_chars < max(40, expected * 0.25):
                    cost += 0.25
                if cost < dp[chapter_index][end]:
                    dp[chapter_index][end] = cost
                    prev_choice[chapter_index][end] = previous_end

    boundaries = [unit_count]
    if chapter_count == 1:
        return boundaries

    last_index = chapter_count - 1
    best_previous_end = -1
    best_cost = inf
    expected_last = total_ko * (zh_lengths[-1] / total_zh)
    for previous_end in range(chapter_count - 1, unit_count):
        previous_cost = dp[last_index - 1][previous_end]
        if previous_cost == inf:
            continue
        segment_chars = prefix[unit_count] - prefix[previous_end]
        cost = previous_cost + abs(segment_chars - expected_last) / total_ko * 0.65
        if segment_chars < max(40, expected_last * 0.25):
            cost += 0.25
        if cost < best_cost:
            best_cost = cost
            best_previous_end = previous_end

    if best_previous_end == -1:
        step = max(unit_count // chapter_count, 1)
        return [min(unit_count, step * (index + 1)) for index in range(chapter_count - 1)] + [unit_count]

    current_end = best_previous_end
    for chapter_index in range(chapter_count - 2, 0, -1):
        boundaries.append(current_end)
        current_end = prev_choice[chapter_index][current_end]
    boundaries.append(current_end)
    boundaries.reverse()
    return boundaries


def _score_alignment(
    *,
    zh_text: str,
    proposed_ko: str,
    existing_ko: str,
    remaining_before: str,
    prev_ko: str,
    next_ko: str,
    index: int,
    total: int,
    total_zh_len: int,
    total_ko_len: int,
) -> tuple[float, list[str]]:
    warnings: list[str] = []
    severe = {
        "empty_segment",
        "leading_overflow",
        "trailing_overflow",
    }

    proposed_len = len(proposed_ko)
    zh_len = len(zh_text)
    remaining_before_len = max(len(remaining_before), 1)

    if proposed_len == 0:
        warnings.append("empty_segment")
    if index == 0 and prev_ko:
        warnings.append("leading_overflow")
    if index == total - 1 and next_ko:
        warnings.append("trailing_overflow")
    if proposed_len and proposed_len < max(40, int(remaining_before_len * 0.03)):
        warnings.append("segment_too_short")
    if existing_ko and proposed_ko == existing_ko:
        warnings.append("unchanged_from_existing")

    zh_ratio = zh_len / max(total_zh_len, 1)
    ko_ratio = proposed_len / max(total_ko_len, 1)
    ratio_delta = abs(zh_ratio - ko_ratio)

    confidence = 0.92
    confidence -= min(ratio_delta * 1.25, 0.35)
    confidence -= 0.18 * len([warning for warning in warnings if warning in severe])
    confidence -= 0.07 * len([warning for warning in warnings if warning not in severe])
    if proposed_len >= 120:
        confidence += 0.04
    confidence = max(0.0, min(confidence, 0.99))
    return round(confidence, 2), warnings


def align_ko_chapters_by_zh(
    records: list[dict[str, Any]],
    *,
    cleaner: CleanerFn,
    splitter: SplitterFn,
    aligner: AlignerFn | None = None,
    confidence_threshold: float = 0.78,
    window_padding_units: int = 1,
) -> list[ChapterAlignmentDecision]:
    candidates = [
        record for record in records
        if cleaner(str(record.get("zh_text", "") or ""), "zh")
    ]
    candidates.sort(key=lambda item: (_chapter_zh_primary(item), int(item.get("chapter_ko", 0) or 0)))
    if not candidates:
        return []

    ko_pool = build_ko_pool(candidates, cleaner)
    if not ko_pool:
        return []

    ko_units = _ensure_minimum_units(_split_text_units(ko_pool), len(candidates))
    if not ko_units:
        return []

    total_zh_len = sum(len(cleaner(str(record.get("zh_text", "") or ""), "zh")) for record in candidates)
    total_ko_len = max(len(ko_pool), 1)
    zh_lengths = [len(cleaner(str(record.get("zh_text", "") or ""), "zh")) for record in candidates]
    boundaries = _plan_global_boundaries(zh_lengths, ko_units)
    decisions: list[ChapterAlignmentDecision] = []
    previous_end = 0

    for index, record in enumerate(candidates):
        zh_text = cleaner(str(record.get("zh_text", "") or ""), "zh")
        existing_ko = cleaner(str(record.get("ko_text", "") or ""), "ko")
        end = boundaries[index] if index < len(boundaries) else len(ko_units)
        planned_units = ko_units[previous_end:end]
        planned_segment = _join_units(planned_units)
        window_start = max(0, previous_end - window_padding_units)
        window_end = min(len(ko_units), end + window_padding_units)
        refinement_window = _join_units(ko_units[window_start:window_end]) or planned_segment

        prev_ko, current_ko, next_ko = splitter(zh_text, refinement_window)
        prev_ko = cleaner(prev_ko, "ko")
        current_ko = cleaner(current_ko, "ko")
        next_ko = cleaner(next_ko, "ko")
        if not current_ko:
            current_ko = planned_segment

        if current_ko and aligner is not None:
            _, aligned_ko = aligner(zh_text, current_ko)
            current_ko = cleaner(aligned_ko, "ko") or current_ko

        confidence, warnings = _score_alignment(
            zh_text=zh_text,
            proposed_ko=current_ko,
            existing_ko=existing_ko,
            remaining_before=refinement_window,
            prev_ko=prev_ko,
            next_ko=next_ko,
            index=index,
            total=len(candidates),
            total_zh_len=total_zh_len,
            total_ko_len=total_ko_len,
        )

        start_reason = (
            "previous overflow removed near the globally planned chapter start"
            if prev_ko
            else "starts near the globally planned source-chapter boundary"
        )
        end_reason = (
            "kept trailing overflow near the next globally planned chapter"
            if next_ko and index < len(candidates) - 1
            else "ends near the globally planned source-chapter boundary"
        )
        auto_applied = confidence >= confidence_threshold and not any(
            warning in {"empty_segment", "leading_overflow", "pool_exhausted_early", "trailing_overflow", "insufficient_progress"}
            for warning in warnings
        )
        decisions.append(
            ChapterAlignmentDecision(
                record_id=str(record.get("id", "") or ""),
                book=str(record.get("book", "") or ""),
                chapter_ko=int(record.get("chapter_ko", 0) or 0),
                chapter_zh=str(record.get("chapter_zh", "") or ""),
                existing_ko_text=existing_ko,
                proposed_ko_text=current_ko,
                confidence=confidence,
                auto_applied=auto_applied,
                warnings=warnings,
                start_reason=start_reason,
                end_reason=end_reason,
            )
        )
        previous_end = end

    return decisions
