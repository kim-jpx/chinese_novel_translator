"""
Translate router - 번역 에이전트 (Claude API)
- 문화적 배경 판단 (동북공정 민감 항목 포함)
- 주석 자동 생성 (한자어, 사자성어, 시/시구, 문화 용어)
- 판단 불가 시 사용자에게 위임
"""

from typing import Optional, List
import json
import os
import asyncio
import re
import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    import jieba
except Exception:  # pragma: no cover - optional fallback for bare environments
    jieba = None

from backend.storage.config import get_style_guide_path
from backend.storage.dataset_repository import (
    DatasetBackendUnavailableError,
    get_dataset_repository,
)
from backend.storage.glossary_store import load_glossary
from backend.storage.translation_memory import (
    build_glossary_hits,
    build_prompt_glossary_table,
    build_prompt_reference_examples,
    build_reference_examples,
)

router = APIRouter()
ANTHROPIC_TIMEOUT_SECONDS = int(os.getenv("ANTHROPIC_TIMEOUT_SECONDS", "180"))


async def anthropic_create_with_timeout(client: anthropic.Anthropic, **kwargs):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(client.messages.create, **kwargs),
            timeout=ANTHROPIC_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Anthropic request timed out")

STYLE_GUIDE_PATH = get_style_guide_path()


def anthropic_error_message(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if body.get("message"):
            return str(body["message"])
    message = getattr(exc, "message", None)
    return str(message or exc)


def raise_anthropic_api_error(exc: Exception, action: str) -> None:
    if isinstance(exc, HTTPException):
        raise exc

    try:
        status_code = int(getattr(exc, "status_code", 0) or getattr(exc, "status", 0) or 0)
    except (TypeError, ValueError):
        status_code = 0
    message = anthropic_error_message(exc)
    lower_message = message.lower()

    if "usage limit" in lower_message or "usage limits" in lower_message:
        raise HTTPException(
            status_code=429,
            detail=f"Anthropic API usage limit reached. {message}",
        )
    if status_code == 429 or "rate limit" in lower_message:
        raise HTTPException(
            status_code=429,
            detail=f"Anthropic API rate limit reached. {message}",
        )
    if status_code in {400, 401, 403}:
        raise HTTPException(status_code=status_code, detail=f"{action} API call failed: {message}")
    raise HTTPException(status_code=502, detail=f"{action} API call failed: {message}")


class TranslateRequest(BaseModel):
    text: str
    book: Optional[str] = None
    genre: List[str] = Field(default_factory=list)
    era_profile: str = "ancient"
    prev_chapter_id: Optional[str] = None
    with_annotations: bool = True   # 주석 생성 여부
    with_cultural_check: bool = True # 문화 판단 여부


class Annotation(BaseModel):
    term: str              # 원문 표현
    type: str              # "한자어" / "사자성어" / "시/시구" / "문화용어" / "지명"
    explanation: str       # 주석 설명
    keep_original: bool    # 원문 표현 그대로 쓰는 경우 True


class CulturalFlag(BaseModel):
    term: str              # 문제 표현
    issue: str             # 판단 이유 (동북공정 관련 등)
    ai_decision: str       # AI 판단 결과 ("유지" / "변경" / "사용자 판단 필요")
    ai_reasoning: str      # 짧은 근거
    suggested: str         # 제안 번역 (있을 경우)
    user_action_needed: bool  # True면 사용자 판단 필요


class GlossaryHit(BaseModel):
    term_zh: str
    term_ko: str
    policy: str = ""
    pos: str = ""
    book: str = ""
    scope: str = "global"
    notes: str = ""
    source_chapter: Optional[int] = None


class ReferenceExample(BaseModel):
    record_id: str
    book: str
    chapter_ko: int
    chapter_zh: str
    source: str
    matched_terms: List[str] = Field(default_factory=list)
    zh_snippet: str
    ko_snippet: str


class TranslationContextSummary(BaseModel):
    confirmed_records: int = 0
    glossary_hits: int = 0
    reference_examples: int = 0


class TranslateResponse(BaseModel):
    translated: str
    terms_used: List[str]
    annotations: List[Annotation]
    cultural_flags: List[CulturalFlag]
    glossary_hits: List[GlossaryHit]
    reference_examples: List[ReferenceExample]
    context_summary: TranslationContextSummary
    model: str


class SyntaxAlignRequest(BaseModel):
    source_text: str
    translation_text: str


class SentenceExplainRequest(BaseModel):
    source_text: str
    translation_text: str = ""
    book: Optional[str] = None
    genre: List[str] = Field(default_factory=list)
    era_profile: str = "ancient"


class SentenceExplainResponse(BaseModel):
    explanation: str
    model: str


class ToneRewriteRequest(BaseModel):
    source_text: str = ""
    translation_text: str
    target_tone: str = "haoche"
    book: Optional[str] = None
    genre: List[str] = Field(default_factory=list)
    era_profile: str = "ancient"


class ToneRewriteResponse(BaseModel):
    rewritten: str
    model: str


class DraftVerifyRequest(BaseModel):
    source_text: str
    translation_text: str
    book: Optional[str] = None
    genre: List[str] = Field(default_factory=list)
    era_profile: str = "ancient"


class DraftVerifyCategory(BaseModel):
    id: str
    label: str
    score: int = 0
    status: str = "warning"
    comment: str = ""


class DraftVerifyIssue(BaseModel):
    severity: str = "minor"
    category: str = "accuracy"
    source_excerpt: str = ""
    translation_excerpt: str = ""
    problem: str
    suggestion: str = ""


class DraftVerifyResponse(BaseModel):
    overall_score: int
    verdict: str
    summary: str
    categories: List[DraftVerifyCategory]
    issues: List[DraftVerifyIssue]
    strengths: List[str] = Field(default_factory=list)
    model: str


class SyntaxAlignPair(BaseModel):
    source: str = ""
    translation: str = ""
    confidence: str = "medium"
    source_annotation: str = ""   # 원문 구절이 번역에 흡수됐을 때 간결한 한국어 의미
    grammar_group: str = ""       # 중국어 문법 패턴 (예: "只有…才…")
    source_order: int = 0          # 원문 후보의 원래 순서
    translation_order: int = 0     # 번역 후보의 원래 순서


class SyntaxAlignResponse(BaseModel):
    pairs: List[SyntaxAlignPair]
    model: str


SOURCE_SENTENCE_RE = re.compile(r"[^。！？!?；;]+[。！？!?；;」』”’）)]*")
TRANSLATION_SENTENCE_RE = re.compile(r"[^.!?…\n]+[.!?…]*")
SOURCE_UNIT_RE = re.compile(r"[^，,、；;：:。！？!?]+[，,、；;：:。！？!?]*")
TRANSLATION_UNIT_RE = re.compile(r"[^,，;；:：.!?…\n]+[,，;；:：.!?…]*")
CHAPTER_NUMBER_RE = r"0-9一二三四五六七八九十百千万零〇两兩"
STANDALONE_QUOTE_CHARS = {"\"", "'", "“", "”", "‘", "’", "「", "」", "『", "』"}
STANDALONE_QUOTE_RE = re.compile(r"([\"'“”‘’「」『』])")
FORBIDDEN_KOREAN_DASH_RE = re.compile(r"[ \t]*(?:[—–―─]+|--+)[ \t]*")
KOREAN_DASH_SEPARATOR_LINE_RE = re.compile(r"^[ \t]*[—–―─-]{2,}[ \t]*$", re.MULTILINE)
SOURCE_PUNCTUATION_RE = re.compile(r"^[，,、；;：:。！？!?“”‘’\"'（）()《》<>「」『』…—-]+$")
ALIGNMENT_PUNCTUATION_ONLY_RE = re.compile(r"^[，,、；;：:。！？!?“”‘’\"'（）()《》<>「」『』…—\-\s]+$")
KOREAN_PARTICLE_RE = re.compile(
    r"(은|는|이|가|을|를|의|에|에서|에게|께|으로|로|와|과|도|만|까지|부터|처럼|보다|"
    r"이라|라|이다|다|고|며|면|니|요|죠|네|군|구나|였다|했다|였다)$"
)
_JIEBA_INITIALIZED = False


def _clean_alignment_segment(value: str, *, source: bool = False) -> str:
    cleaned = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if source:
        return re.sub(r"\s*\n\s*", "", cleaned).strip()
    return re.sub(r"[ \t]+", " ", cleaned).strip()


def _is_alignment_punctuation_only(value: str) -> bool:
    cleaned = value.strip()
    return bool(cleaned) and bool(ALIGNMENT_PUNCTUATION_ONLY_RE.fullmatch(cleaned))


def _join_alignment_fragment(base: str, fragment: str, *, prepend: bool = False) -> str:
    if not fragment:
        return base
    if not base:
        return fragment
    return f"{fragment}{base}" if prepend else f"{base}{fragment}"


def _merge_punctuation_only_segments(segments: list[str]) -> list[str]:
    merged: list[str] = []
    pending_prefix = ""

    for segment in segments:
        if _is_alignment_punctuation_only(segment):
            if merged:
                merged[-1] = _join_alignment_fragment(merged[-1], segment)
            else:
                pending_prefix = _join_alignment_fragment(pending_prefix, segment)
            continue

        if pending_prefix:
            segment = _join_alignment_fragment(segment, pending_prefix, prepend=True)
            pending_prefix = ""
        merged.append(segment)

    if pending_prefix and merged:
        merged[-1] = _join_alignment_fragment(merged[-1], pending_prefix)

    return merged


def _split_alignment_paragraphs(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []
    return [
        paragraph.strip()
        for paragraph in re.split(r"\n\s*\n+", normalized)
        if paragraph.strip()
    ]


def _regex_split_alignment(text: str, pattern: re.Pattern[str], *, source: bool) -> list[str]:
    matches = [_clean_alignment_segment(match.group(0), source=source) for match in pattern.finditer(text)]
    matches = [match for match in matches if match]
    if matches:
        return matches
    return [
        _clean_alignment_segment(line, source=source)
        for line in text.splitlines()
        if _clean_alignment_segment(line, source=source)
    ]


def _split_alignment_sentences(text: str, *, source: bool) -> list[str]:
    pattern = SOURCE_SENTENCE_RE if source else TRANSLATION_SENTENCE_RE
    sentences: list[str] = []
    for paragraph in _split_alignment_paragraphs(text):
        sentences.extend(_regex_split_alignment(paragraph, pattern, source=source))
    return _merge_punctuation_only_segments(sentences)


def _split_alignment_units(text: str, *, source: bool) -> list[str]:
    pattern = SOURCE_UNIT_RE if source else TRANSLATION_UNIT_RE
    units: list[str] = []
    for sentence in _split_alignment_sentences(text, source=source):
        if not source and _is_translation_heading(sentence):
            units.append(sentence)
            continue
        matches = _regex_split_alignment(sentence, pattern, source=source)
        units.extend(matches or [sentence])
    return units


def _initialize_chinese_segmenter() -> None:
    global _JIEBA_INITIALIZED
    if _JIEBA_INITIALIZED or jieba is None:
        return
    try:
        for term in load_glossary():
            term_zh = str(term.get("term_zh") or term.get("zh") or term.get("term") or "").strip()
            if term_zh and re.search(r"[\u3400-\u9fff]", term_zh):
                jieba.add_word(term_zh, freq=200000)
    except Exception:
        pass
    _JIEBA_INITIALIZED = True


def _merge_source_phrase_tokens(tokens: list[str]) -> list[str]:
    merged: list[str] = []
    pending_prefix = ""
    opening = {"“", "‘", "\"", "'", "（", "(", "《", "<"}
    for token in tokens:
        cleaned = token.strip()
        if not cleaned:
            continue
        if cleaned in STANDALONE_QUOTE_CHARS:
            if pending_prefix:
                merged.append(pending_prefix)
                pending_prefix = ""
            merged.append(cleaned)
            continue
        if SOURCE_PUNCTUATION_RE.fullmatch(cleaned):
            if cleaned in opening:
                pending_prefix += cleaned
            elif merged:
                merged[-1] += cleaned
            else:
                pending_prefix += cleaned
            continue
        merged.append(f"{pending_prefix}{cleaned}")
        pending_prefix = ""
    if pending_prefix and merged:
        merged[-1] += pending_prefix
    return merged


def _fallback_split_source_phrase(segment: str) -> list[str]:
    parts = [
        part
        for part in re.split(r"([，,、；;：:。！？!?“”‘’\"'（）()《》<>「」『』…—-])", segment)
        if part and part.strip()
    ]
    tokens: list[str] = []
    for part in parts:
        if SOURCE_PUNCTUATION_RE.fullmatch(part.strip()):
            tokens.append(part.strip())
            continue
        tokens.extend(re.findall(r"[\u3400-\u9fff]{1,4}|[A-Za-z0-9]+|[^\s]", part))
    return _merge_source_phrase_tokens(tokens)


def _add_source_context_terms(text: str) -> None:
    if jieba is None:
        return
    patterns = [
        r"[\u3400-\u9fff]{2,8}(?:帝国|王朝|皇朝|皇室|宗门|秘境|学院|书院|山脉|大陆)",
        r"[\u3400-\u9fff]{1,2}(?:家|府|城|宫|殿|阁|堂|域|族)",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            term = match.group(0)
            if 2 <= len(term) <= 10:
                jieba.add_word(term, freq=200000)


def _split_source_phrase_candidates(segment: str) -> list[str]:
    cleaned = _clean_alignment_segment(segment, source=True)
    if not cleaned:
        return []
    if _is_source_heading(cleaned):
        return [cleaned]
    if jieba is None:
        return _fallback_split_source_phrase(cleaned)
    _initialize_chinese_segmenter()
    try:
        for fixed_term in ["帝都"]:
            if fixed_term in cleaned:
                jieba.add_word(fixed_term, freq=200000)
        _add_source_context_terms(cleaned)
        tokens = [token for token in jieba.lcut(cleaned, HMM=True) if token.strip()]
    except Exception:
        return _fallback_split_source_phrase(cleaned)
    return _merge_source_phrase_tokens(tokens)


def _split_translation_phrase_candidates(segment: str) -> list[str]:
    cleaned = _clean_alignment_segment(segment, source=False)
    if not cleaned:
        return []
    if _is_translation_heading(cleaned):
        return [cleaned]
    tokens = re.findall(r"[^\s,，;；:：.!?…]+[,，;；:：.!?…]*", cleaned)
    tokens = [token.strip() for token in tokens if token.strip()]
    if not tokens:
        return [cleaned]
    quote_split_tokens: list[str] = []
    for token in tokens:
        quote_split_tokens.extend([
            part.strip()
            for part in STANDALONE_QUOTE_RE.split(token)
            if part and part.strip()
        ])
    return quote_split_tokens


def _split_alignment_phrases(text: str, *, source: bool) -> list[str]:
    phrases: list[str] = []
    for unit in _split_alignment_units(text, source=source):
        if source:
            phrases.extend(_split_source_phrase_candidates(unit))
        else:
            phrases.extend(_split_translation_phrase_candidates(unit))
    return phrases


def _strip_heading_markup(text: str) -> str:
    return re.sub(r"^#{1,6}\s*", "", text.strip()).strip()


def _is_translation_heading(text: str) -> bool:
    cleaned = _strip_heading_markup(text)
    if not cleaned:
        return False
    if text.strip().startswith("#"):
        return True
    if len(cleaned) > 80:
        return False
    patterns = [
        rf"^제\s*[{CHAPTER_NUMBER_RE}]+\s*[장화회]",
        rf"^[{CHAPTER_NUMBER_RE}]+\s*[장화회]",
        rf"^第\s*[{CHAPTER_NUMBER_RE}]+\s*[章回节節]",
        r"^chapter\s+\d+",
    ]
    return any(re.search(pattern, cleaned, re.IGNORECASE) for pattern in patterns)


def _is_source_heading(text: str) -> bool:
    cleaned = _strip_heading_markup(_clean_alignment_segment(text, source=True))
    if not cleaned or len(cleaned) > 60:
        return False
    return bool(re.search(rf"^第\s*[{CHAPTER_NUMBER_RE}]+\s*[章回节節]", cleaned))


def _build_alignment_pairs(
    source_segments: list[str], translation_segments: list[str]
) -> list[SyntaxAlignPair]:
    pairs: list[SyntaxAlignPair] = []
    source_index = 0
    translation_index = 0

    while source_index < len(source_segments) or translation_index < len(translation_segments):
        source_segment = source_segments[source_index] if source_index < len(source_segments) else ""
        translation_segment = (
            translation_segments[translation_index]
            if translation_index < len(translation_segments)
            else ""
        )

        if (
            translation_segment
            and _is_translation_heading(translation_segment)
            and (not source_segment or not _is_source_heading(source_segment))
        ):
            pairs.append(SyntaxAlignPair(source="", translation=translation_segment, confidence="low"))
            translation_index += 1
            continue

        if source_segment and translation_segment:
            pairs.append(SyntaxAlignPair(source=source_segment, translation=translation_segment, confidence="medium"))
            source_index += 1
            translation_index += 1
            continue

        if source_segment:
            pairs.append(SyntaxAlignPair(source=source_segment, translation="", confidence="low"))
            source_index += 1
            continue

        if translation_segment:
            pairs.append(SyntaxAlignPair(source="", translation=translation_segment, confidence="low"))
            translation_index += 1

    return pairs


def _partition_alignment_units(units: list[str], group_count: int) -> list[list[str]]:
    if group_count <= 0:
        return []
    base_size = len(units) // group_count
    extra = len(units) % group_count
    groups: list[list[str]] = []
    cursor = 0
    for index in range(group_count):
        size = base_size + (1 if index < extra else 0)
        groups.append(units[cursor:cursor + size])
        cursor += size
    return groups


def _join_alignment_units(units: list[str], *, source: bool) -> str:
    joined = "".join(units) if source else " ".join(units)
    return _clean_alignment_segment(joined, source=source)


SOURCE_ANNOTATION_HINTS = {
    "此时": "지금",
    "竟是": "뜻밖에도",
    "却是": "뜻밖에도",
    "平时": "평소",
    "几乎": "거의",
    "皆": "하나같이/모두",
    "尽": "모두",
    "十分": "매우",
}

GRAMMAR_GROUP_HINTS = [
    ("只有…才…", ("只有", "才")),
    ("虽然…但是…", ("虽然", "但是")),
    ("虽…却…", ("虽", "却")),
    ("越…越…", ("越", "越")),
    ("不但…而且…", ("不但", "而且")),
    ("不是…而是…", ("不是", "而是")),
]


def _repair_syntax_alignment_metadata(pairs: list[SyntaxAlignPair]) -> list[SyntaxAlignPair]:
    """Add deterministic review metadata when the model omits common function words."""
    for grammar_group, markers in GRAMMAR_GROUP_HINTS:
        marker_positions: list[int] = []
        search_start = 0
        for marker in markers:
            found_index = next(
                (
                    index
                    for index in range(search_start, len(pairs))
                    if marker in pairs[index].source
                ),
                None,
            )
            if found_index is None:
                break
            marker_positions.append(found_index)
            search_start = found_index + 1

        if len(marker_positions) != len(markers):
            continue

        for index in range(min(marker_positions), max(marker_positions) + 1):
            if not pairs[index].grammar_group:
                pairs[index].grammar_group = grammar_group

    for pair in pairs:
        if pair.source_annotation:
            continue
        hints = [
            meaning
            for marker, meaning in SOURCE_ANNOTATION_HINTS.items()
            if marker in pair.source
        ]
        if hints:
            pair.source_annotation = " / ".join(dict.fromkeys(hints))

    return pairs


def _build_sentence_alignment_pairs(source_text: str, translation_text: str) -> list[SyntaxAlignPair]:
    return _build_alignment_pairs(
        _split_alignment_sentences(source_text, source=True),
        _split_alignment_sentences(translation_text, source=False),
    )


def _expand_sentence_pair_to_syntax_pairs(pair: SyntaxAlignPair) -> list[SyntaxAlignPair]:
    source_units = _split_alignment_phrases(pair.source, source=True) if pair.source else []
    translation_units = (
        _split_alignment_phrases(pair.translation, source=False) if pair.translation else []
    )

    if source_units and not translation_units:
        return [
            SyntaxAlignPair(source=source_unit, translation="", confidence="low")
            for source_unit in source_units
        ]
    if translation_units and not source_units:
        return [
            SyntaxAlignPair(source="", translation=translation_unit, confidence="low")
            for translation_unit in translation_units
        ]
    if not source_units and not translation_units:
        return []

    if len(source_units) == len(translation_units) and max(len(source_units), len(translation_units)) <= 6:
        return [
            SyntaxAlignPair(source=source_unit, translation=translation_unit, confidence=pair.confidence)
            for source_unit, translation_unit in zip(source_units, translation_units)
        ]

    if len(source_units) == 1 or len(translation_units) == 1:
        return [
            SyntaxAlignPair(
                source=pair.source,
                translation=pair.translation,
                confidence="medium" if pair.confidence != "low" else "low",
            )
        ]

    group_count = min(len(source_units), len(translation_units))
    source_groups = _partition_alignment_units(source_units, group_count)
    translation_groups = _partition_alignment_units(translation_units, group_count)
    confidence = (
        "low"
        if max(len(source_units), len(translation_units)) > 6
        else "medium" if pair.confidence != "low" else "low"
    )
    return [
        SyntaxAlignPair(
            source=_join_alignment_units(source_group, source=True),
            translation=_join_alignment_units(translation_group, source=False),
            confidence=confidence,
        )
        for source_group, translation_group in zip(source_groups, translation_groups)
    ]


def _expand_sentence_pairs_to_syntax_pairs(sentence_pairs: list[SyntaxAlignPair]) -> list[SyntaxAlignPair]:
    pairs: list[SyntaxAlignPair] = []
    for sentence_pair in sentence_pairs:
        pairs.extend(_expand_sentence_pair_to_syntax_pairs(sentence_pair))
    return _repair_syntax_alignment_metadata(pairs)


def build_local_syntax_alignment(source_text: str, translation_text: str) -> list[SyntaxAlignPair]:
    return _repair_syntax_alignment_metadata(
        _expand_sentence_pairs_to_syntax_pairs(
            _build_sentence_alignment_pairs(source_text, translation_text)
        )
    )


def _format_numbered_alignment_segments(segments: list[str], prefix: str) -> str:
    if not segments:
        return "(없음)"
    return "\n".join(f"{prefix}{index + 1}: {segment}" for index, segment in enumerate(segments))


def _ai_pairs_need_heading_fallback(pairs: list[SyntaxAlignPair]) -> bool:
    for pair in pairs:
        if not pair.source and not pair.translation:
            continue
        return bool(
            pair.source
            and pair.translation
            and _is_translation_heading(pair.translation)
            and not _is_source_heading(pair.source)
        )
    return False


def load_glossary_filtered(book: Optional[str] = None) -> list[dict]:
    terms = load_glossary()
    if book:
        terms = [
            term
            for term in terms
            if not term.get("domain")
            or term.get("domain") == book
            or term.get("book") == book
        ]
    return terms


def load_style_guide_filtered() -> str:
    if not STYLE_GUIDE_PATH.exists():
        return "스타일 가이드 없음"
    return STYLE_GUIDE_PATH.read_text(encoding="utf-8")[:3000]


def load_prev_chapter_sample(chapter_id: str) -> str:
    if not chapter_id:
        return ""
    try:
        record = get_dataset_repository().get_record(chapter_id)
    except DatasetBackendUnavailableError:
        return ""
    if record:
        ko = record.get("ko_text_confirmed") or record.get("ko_text", "")
        return ko[:800] + "..." if len(ko) > 800 else ko
    return ""


def load_translation_memory_context(
    *,
    book: Optional[str],
    source_text: str,
    prev_chapter_id: Optional[str],
) -> tuple[list[dict], list[dict], int]:
    glossary_terms = load_glossary_filtered(book)

    if not book:
        glossary_hits = build_glossary_hits(glossary_terms, source_text, book=book)
        return glossary_hits, [], 0

    try:
        records = get_dataset_repository().list_records(book_exact=book, status="confirmed")
    except (DatasetBackendUnavailableError, Exception):
        glossary_hits = build_glossary_hits(glossary_terms, source_text, book=book)
        return glossary_hits, [], 0

    glossary_hits = build_glossary_hits(glossary_terms, source_text, book=book)
    confirmed_records = [
        record
        for record in records
        if str(record.get("zh_text", "")).strip()
        and str(record.get("ko_text_confirmed") or record.get("ko_text") or "").strip()
    ]
    examples = build_reference_examples(
        records,
        source_text,
        glossary_hits,
        prev_record_id=prev_chapter_id or None,
        limit=5,
    )
    return glossary_hits, examples, len(confirmed_records)


def build_system_prompt(
    era_profile,
    genre,
    glossary_text,
    style_guide_text,
    prev_sample,
    reference_examples_text,
    with_annotations,
    with_cultural_check,
) -> str:
    genre_str = "/".join(genre) if genre else "고장극"
    prev_section = f"\n## 이전 화 번역 스타일 참고\n{prev_sample}" if prev_sample else ""

    annotation_instruction = ""
    if with_annotations:
        annotation_instruction = """
## 주석 생성 규칙
번역 후 반드시 아래 JSON 배열을 포함하세요:

```annotations
[
  {
    "term": "원문 표현",
    "type": "한자어|사자성어|시/시구|문화용어|지명",
    "explanation": "간결한 설명 (1~2줄)",
    "keep_original": true/false
  }
]
```

주석 대상:
- **한자어**: 당옥(堂屋), 진왕부 등 원문 그대로 쓰는 게 나은 경우
- **사자성어**: 뜻과 맥락 설명
- **시/시구**: 출처와 의미
- **문화용어**: 중국 고유 풍습/제도 (음식, 의복, 예법 등)
- **지명**: 역사적 맥락 있는 지명
"""

    cultural_instruction = ""
    if with_cultural_check:
        cultural_instruction = """
## 문화적 배경 판단 규칙 (중요)
번역 후 반드시 아래 JSON 배열을 포함하세요:

```cultural_flags
[
  {
    "term": "문제 표현",
    "issue": "판단 이유",
    "ai_decision": "유지|변경|사용자 판단 필요",
    "ai_reasoning": "근거 (1~2줄)",
    "suggested": "대안 번역 (있을 경우)",
    "user_action_needed": true/false
  }
]
```

판단 기준:
- **동북공정 민감 항목**: 중국 문화를 한국 전통문화로 치환하지 않는다.
  예) 炕(온돌 아님 → 캉/침상), 만두(중국식 만두 ≠ 한국식 만두)
- **표현이 애매한 경우**: `user_action_needed: true`로 설정하고 판단 위임
- **명확히 중립적인 경우**: 빈 배열 [] 반환 가능
- **판단 근거를 항상 한 줄로 서술** (근거 없는 판단 금지)
"""

    return f"""당신은 중국 {genre_str} 소설 전문 번역가입니다.

## 번역 원칙
1. 의미 보존 우선. 사건/관계/권력구조 정보 누락 금지.
2. 아래 [용어사전]에 있는 용어는 반드시 지정된 한국어 번역어 사용.
3. 같은 작품의 [확정 예문]이 있으면 그 번역 습관과 용어 선택을 우선적으로 따른다.
4. 아래 [스타일 가이드]의 장르 규칙을 따름.
5. 과도한 한문투 남발 금지. 읽히는 자연스러운 한국어 우선.
6. 대사 따옴표는 큰따옴표("") 사용.
7. 한국어 번역문에는 엠대시/엔대시/가로줄 계열 문장부호를 쓰지 않는다.
   금지 문자: —, –, ―, ─, --.
   제목, 대사, 독백, 본문 어디에도 예외 없이 금지한다.
   삽입구나 호흡은 한국어에 맞게 쉼표, 마침표, 괄호, 말줄임표 등으로 자연스럽게 풀어 쓴다.
   장식용 구분선도 번역문에 넣지 않는다.
8. 전체 회차 번역에서는 원문 순서와 문단 흐름을 유지한다. 요약, 생략, 임의 장면 추가 금지.
9. 제목을 제외한 본문에는 마크다운 헤더/불릿/번호 목록을 만들지 않는다.
10. 등장인물의 말투와 호칭은 같은 작품 안에서 일관되게 유지한다.
    같은 인물이 이전 화나 확정 예문에서 하오체/하십시오체/해요체/반말/문어체를 사용했다면 그 패턴을 우선 따른다.
    신분, 나이, 관계, 권력 차이에 맞는 높임법을 유지하고 문장마다 임의로 바꾸지 않는다.
11. 대사 말투를 바꿔야 할 때도 의미와 감정 강도는 유지하고, 말투만 자연스럽게 조정한다.

## 시대 배경: {era_profile}
- ancient: 공자/낭자/전하/은량/이랑 등 고풍 용어 사용
- mixed: 고풍 서사 + 현대식 은유 병행 (한 문단 내 과도 혼합 금지)
- modern: 현대 기준 언어 유지
- unknown: 원문 문체와 내용을 분석하여 가장 적합한 시대배경을 스스로 판단하고 그에 맞게 번역

## 장르: {genre_str}

## 직접 적용할 용어
{glossary_text}

## 스타일 가이드
{style_guide_text}
{prev_section}

## 같은 작품 확정 예문
{reference_examples_text}

{annotation_instruction}
{cultural_instruction}

## 출력 형식
1. 번역문 (일반 텍스트)
2. ```annotations [...] ``` 블록 (주석 요청 시)
3. ```cultural_flags [...] ``` 블록 (문화 판단 요청 시)

번역문 외 불필요한 설명은 하지 마세요."""


def parse_json_block(text: str, tag: str) -> list:
    """응답에서 ```tag [...] ``` 블록 파싱"""
    pattern = f"```{tag}\\s*(.*?)\\s*```"
    import re
    m = re.search(pattern, text, re.S)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except Exception:
        return []


def strip_json_blocks(text: str) -> str:
    """번역문에서 JSON 블록 제거"""
    import re
    text = re.sub(r'```(?:annotations|cultural_flags).*?```', '', text, flags=re.S)
    return text.strip()


def sanitize_korean_translation_punctuation(text: str) -> str:
    """Ensure generated Korean translation never contains dash punctuation disallowed by the style guide."""
    cleaned = KOREAN_DASH_SEPARATOR_LINE_RE.sub("", text)
    cleaned = FORBIDDEN_KOREAN_DASH_RE.sub(", ", cleaned)
    cleaned = re.sub(r",\s*,+", ", ", cleaned)
    cleaned = re.sub(r"[ \t]+([,.!?…])", r"\1", cleaned)
    cleaned = re.sub(r"([(\[{「『])\s*,\s*", r"\1", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def parse_json_object(text: str) -> dict:
    """Claude 응답에서 JSON 객체만 추출."""
    import re

    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError("JSON object not found")
    return json.loads(match.group(0))


VERIFY_CATEGORY_DEFAULTS = [
    ("consistency", "전체 일관성"),
    ("accuracy", "문법/해석 정확도"),
    ("naturalness", "한국어 자연스러움"),
    ("terminology", "용어/고유명사"),
    ("omission", "누락/추가"),
    ("style", "문체/말투"),
]


def _coerce_score(value, default: int = 0) -> int:
    try:
        score = int(round(float(value)))
    except Exception:
        score = default
    return max(0, min(score, 100))


def _normalize_verify_status(value: str, score: int) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"pass", "warning", "fail"}:
        return normalized
    if score >= 85:
        return "pass"
    if score >= 65:
        return "warning"
    return "fail"


def _normalize_verify_severity(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"critical", "major", "minor", "suggestion"}:
        return normalized
    return "minor"


VERIFY_DASH_ISSUE_KEYWORD_RE = re.compile(r"(엠대시|엔대시|대시|dash|가로줄)")


def _translation_has_forbidden_korean_dash(value: str) -> bool:
    return bool(FORBIDDEN_KOREAN_DASH_RE.search(value) or KOREAN_DASH_SEPARATOR_LINE_RE.search(value))


def _mentions_dash_issue(*texts: str) -> bool:
    return any(VERIFY_DASH_ISSUE_KEYWORD_RE.search(str(text or "")) for text in texts)


def _strip_dash_issue_sentences(text: str) -> str:
    parts = [
        part.strip()
        for part in re.split(r"(?<=[.!?。！？])\s+|\n+", str(text or "").strip())
        if part.strip()
    ]
    kept = [part for part in parts if not _mentions_dash_issue(part)]
    return " ".join(kept).strip()


def _remove_false_dash_verify_findings(
    response: DraftVerifyResponse,
    *,
    translation_text: str,
) -> DraftVerifyResponse:
    if _translation_has_forbidden_korean_dash(translation_text):
        return response

    response.issues = [
        issue
        for issue in response.issues
        if not _mentions_dash_issue(issue.problem, issue.suggestion, issue.translation_excerpt)
    ]

    for category in response.categories:
        if category.id != "style":
            continue
        if _mentions_dash_issue(category.comment):
            cleaned = _strip_dash_issue_sentences(category.comment)
            category.comment = cleaned or "한국어 번역문에서 금지된 대시 문장부호는 감지되지 않았습니다."

    if _mentions_dash_issue(response.summary):
        cleaned_summary = _strip_dash_issue_sentences(response.summary)
        response.summary = cleaned_summary or "한국어 번역문에서 금지된 대시 문장부호는 감지되지 않았습니다."

    return response


def normalize_draft_verify_response(parsed: dict, *, model: str, translation_text: str) -> DraftVerifyResponse:
    categories_by_id: dict[str, DraftVerifyCategory] = {}
    for raw in parsed.get("categories", []):
        if not isinstance(raw, dict):
            continue
        category_id = str(raw.get("id", "") or "").strip() or "misc"
        score = _coerce_score(raw.get("score", 0), 0)
        categories_by_id[category_id] = DraftVerifyCategory(
            id=category_id,
            label=str(raw.get("label", "") or category_id).strip(),
            score=score,
            status=_normalize_verify_status(str(raw.get("status", "")), score),
            comment=str(raw.get("comment", "") or "").strip(),
        )

    categories: list[DraftVerifyCategory] = []
    for category_id, label in VERIFY_CATEGORY_DEFAULTS:
        if category_id in categories_by_id:
            category = categories_by_id[category_id]
            if not category.label:
                category.label = label
            categories.append(category)
        else:
            categories.append(
                DraftVerifyCategory(
                    id=category_id,
                    label=label,
                    score=0,
                    status="warning",
                    comment="AI 응답에 이 항목의 상세 평가가 없습니다.",
                )
            )

    issues: list[DraftVerifyIssue] = []
    for raw in parsed.get("issues", []):
        if not isinstance(raw, dict):
            continue
        problem = str(raw.get("problem", "") or "").strip()
        if not problem:
            continue
        issues.append(
            DraftVerifyIssue(
                severity=_normalize_verify_severity(str(raw.get("severity", ""))),
                category=str(raw.get("category", "") or "accuracy").strip(),
                source_excerpt=str(raw.get("source_excerpt", "") or "").strip(),
                translation_excerpt=str(raw.get("translation_excerpt", "") or "").strip(),
                problem=problem,
                suggestion=str(raw.get("suggestion", "") or "").strip(),
            )
        )

    overall_score = _coerce_score(
        parsed.get("overall_score"),
        round(sum(category.score for category in categories) / max(len(categories), 1)),
    )
    verdict = str(parsed.get("verdict", "") or "").strip().lower()
    if verdict not in {"ready", "needs_minor_revision", "needs_major_revision"}:
        if any(issue.severity in {"critical", "major"} for issue in issues) or overall_score < 70:
            verdict = "needs_major_revision"
        elif issues or overall_score < 88:
            verdict = "needs_minor_revision"
        else:
            verdict = "ready"

    strengths = [
        str(item).strip()
        for item in parsed.get("strengths", [])
        if str(item).strip()
    ]
    response = DraftVerifyResponse(
        overall_score=overall_score,
        verdict=verdict,
        summary=str(parsed.get("summary", "") or "").strip() or "AI 검증 요약이 비어 있습니다.",
        categories=categories,
        issues=issues,
        strengths=strengths,
        model=model,
    )
    return _remove_false_dash_verify_findings(response, translation_text=translation_text)


def build_draft_verify_prompt(
    *,
    source_text: str,
    translation_text: str,
    book: Optional[str],
    genre: list[str],
    era_profile: str,
    glossary_text: str,
    style_guide_text: str,
    reference_examples_text: str,
) -> str:
    genre_str = "/".join(genre) if genre else "고장극"
    return f"""중국어 웹소설 원문과 한국어 번역 초안을 전문 편집자 관점에서 검증하세요.

목표:
- 초안을 바로 확정해도 되는지 판단합니다.
- 원문 의미 보존, 문법/해석 정확도, 한국어 자연스러움, 용어/고유명사 일관성, 누락/추가, 문체/말투 일관성을 평가합니다.
- 문제를 발견하면 실제 수정에 필요한 짧은 근거와 제안을 제공합니다.

검증 규칙:
- 한국어로만 작성하세요.
- 번역문 전체를 다시 쓰지 마세요. 문제 지점과 수정 방향만 제시하세요.
- 원문에 없는 내용을 번역이 추가했거나 원문 내용이 누락되면 반드시 이슈에 포함하세요.
- 같은 인물의 말투, 호칭, 존대/반말이 흔들리면 이슈에 포함하세요.
- 용어사전과 확정 예문이 있으면 그 기준을 우선 적용하세요.
- 엠대시/엔대시/가로줄 계열 문장부호 검사는 반드시 한국어 번역문에 대해서만 판단하세요.
  원문에만 해당 기호가 있고 번역문이 쉼표나 다른 한국어 문장부호로 자연스럽게 바뀌었다면 이슈로 잡지 마세요.
- 한국어 번역문에 엠대시/엔대시/가로줄 계열 문장부호가 있으면 문체/문장부호 이슈로 잡으세요.
  금지 문자: —, –, ―, ─, --.
- 확실하지 않은 부분은 단정하지 말고 "추정"이라고 표시하세요.
- 출력은 JSON 객체만 반환하세요. 마크다운, 코드블록, 설명문 금지.

점수 기준:
- 90~100: 확정 가능. 사소한 취향 수정만 있음.
- 75~89: 소폭 수정 후 확정 가능.
- 60~74: 주요 문장 몇 개 재검토 필요.
- 0~59: 전체 재검토 또는 재번역 필요.

JSON 형식:
{{
  "overall_score": 0,
  "verdict": "ready|needs_minor_revision|needs_major_revision",
  "summary": "전체 판단 2~4문장",
  "categories": [
    {{"id":"consistency","label":"전체 일관성","score":0,"status":"pass|warning|fail","comment":"짧은 평가"}},
    {{"id":"accuracy","label":"문법/해석 정확도","score":0,"status":"pass|warning|fail","comment":"짧은 평가"}},
    {{"id":"naturalness","label":"한국어 자연스러움","score":0,"status":"pass|warning|fail","comment":"짧은 평가"}},
    {{"id":"terminology","label":"용어/고유명사","score":0,"status":"pass|warning|fail","comment":"짧은 평가"}},
    {{"id":"omission","label":"누락/추가","score":0,"status":"pass|warning|fail","comment":"짧은 평가"}},
    {{"id":"style","label":"문체/말투","score":0,"status":"pass|warning|fail","comment":"짧은 평가"}}
  ],
  "issues": [
    {{
      "severity": "critical|major|minor|suggestion",
      "category": "accuracy|naturalness|terminology|omission|style|consistency",
      "source_excerpt": "관련 원문 짧은 인용",
      "translation_excerpt": "관련 번역 짧은 인용",
      "problem": "문제 설명",
      "suggestion": "수정 제안"
    }}
  ],
  "strengths": ["잘 된 점 1", "잘 된 점 2"]
}}

작품: {book or "미지정"}
장르: {genre_str}
시대 배경: {era_profile}

[스타일 가이드]
{style_guide_text}

[관련 용어]
{glossary_text}

[같은 작품 확정 예문]
{reference_examples_text}

[중국어 원문]
{source_text}

[한국어 번역 초안]
{translation_text}
"""


def _build_syntax_alignment_prompt(
    source_segments: list[str], translation_segments: list[str]
) -> str:
    return f"""중국어 원문과 한국어 번역문을 검수하기 쉽게 단어/짧은 구 단위로 정렬하세요.

규칙:
- 번역하거나 고치지 마세요.
- 입력 텍스트를 JSON 문자열로 다시 쓰지 말고, 반드시 아래 후보 번호만 사용하세요.
- source_indexes에는 대응하는 중국어 원문 후보 번호, translation_indexes에는 대응하는 한국어 번역 후보 번호를 넣으세요.
- 빠진 내용이나 대응이 애매한 내용도 버리지 말고 빈 문자열과 함께 별도 pair로 남기세요.
- 대응 후보가 없으면 빈 배열 []을 사용하세요.
- 따옴표나 괄호 같은 문장부호 하나만 별도 pair로 만들지 말고 앞뒤 의미 단위에 붙이세요.
- 번역문 앞의 마크다운 제목, "제 N장 ..." 같은 회차 제목이 중국어 원문에 대응되지 않으면 source_indexes를 []로 둔 별도 pair로 남기세요.
- 회차 제목을 첫 중국어 본문 문장과 절대 매칭하지 마세요.
- 중국어 원문 문장이 번역에서 누락되었으면 translation_indexes를 []로 둔 pair로 남기세요. 이후 문장을 앞당겨 억지 매칭하지 마세요.
- 원문 후보 번호 순서를 유지하고, 한국어 번역 단위도 자연스러운 한국어 어순을 따르세요. 중국어 어순에 억지로 맞추지 마세요.
- translation_indexes는 실제 한국어 번역 안에서 대응되는 위치만 넣으세요. 한국어 문장을 중국어 순서처럼 재배열하거나 어색하게 맞추면 실패입니다.
- 아래 입력은 이미 단어/짧은 구 후보 단위로 쪼개져 있습니다. 가능한 한 이 후보 단위를 유지해서 맞추세요.
- 고유명사, 인명, 지명, 수식어, 동작, 부정/시제 표현을 최대한 세밀하게 대응시키세요.
- 한국어 조사/어미 때문에 1:1 대응이 안 되면 여러 후보 번호를 한 pair에 묶어도 됩니다.
- 한 pair에는 source_indexes 1~2개, translation_indexes 1~4개를 권장합니다.
- 여러 후보가 같은 의미 단위에 묶여야 할 때만 합치고, 한 문장 전체나 긴 절 전체를 통째로 묶지 마세요.
- 긴 절이나 문장 수준으로 묶인 pair는 실패로 간주됩니다. 반드시 단어/짧은 구로 나누세요.
- confidence는 "high", "medium", "low" 중 하나만 사용하세요.
- source_annotation: 원문 구절의 의미가 번역에 간접적으로 흡수되어 한국어 토큰으로 명시되지 않을 때,
  간결한 한국어 의미를 넣으세요 (예: "지금", "뜻밖에도"). 번역에 명시되어 있으면 빈 문자열 ""로 두세요.
- 기능어, 부사, 강조 표현은 번역문에 직접 대응 토큰이 있더라도 검수에 도움이 되면 source_annotation을 넣어도 됩니다
  (예: 此时="지금", 竟是="뜻밖에도", 皆="하나같이/모두").
- grammar_group: 원문 구절이 특정 중국어 문법 패턴의 일부이면 패턴 이름을 넣으세요
  (예: "只有…才…", "虽然…但是…", "越…越…", "不但…而且…"). 아닐 경우 빈 문자열 ""로 두세요.
  같은 패턴에 속하는 모든 pair에 동일한 grammar_group 값을 부여하세요.
- JSON 객체만 출력하세요. 마크다운, 설명, 코드블록을 출력하지 마세요.

출력 형식:
{{
  "pairs": [
    {{"source_indexes": [1], "translation_indexes": [1], "confidence": "high", "source_annotation": "", "grammar_group": ""}}
  ]
}}

[중국어 원문 단어/구 후보]
{_format_numbered_alignment_segments(source_segments, "S")}

[한국어 번역문 단어/구 후보]
{_format_numbered_alignment_segments(translation_segments, "T")}
"""


def _build_sentence_alignment_prompt(
    source_sentences: list[str], translation_sentences: list[str]
) -> str:
    return f"""중국어 원문 문장과 한국어 번역 문장을 검수 row 단위로 정렬하세요.

가장 중요한 규칙:
- 한 row의 좌측 원문과 우측 번역은 반드시 같은 내용이어야 합니다.
- 단어/구 단위가 아니라 문장/짧은 문단 row 단위로만 정렬하세요.
- 번역문이 원문 한 문장을 두 문장으로 나누었으면 translation_indexes에 여러 번호를 넣으세요.
- 번역문이 원문 여러 문장을 한 문장으로 합쳤으면 source_indexes에 여러 번호를 넣으세요.
- 번역이 누락된 원문은 translation_indexes를 []로 두세요.
- 원문에 없는 번역문, 회차 제목, 보충 문장은 source_indexes를 []로 두세요.
- 모르면 억지로 앞당겨 맞추지 말고 빈 배열 []을 사용하세요.
- source_indexes와 translation_indexes는 각각 오름차순을 유지하세요.
- JSON 객체만 출력하세요. 마크다운, 설명, 코드블록을 출력하지 마세요.

출력 형식:
{{
  "rows": [
    {{"source_indexes": [1], "translation_indexes": [1], "confidence": "high"}}
  ]
}}

[중국어 원문 문장 후보]
{_format_numbered_alignment_segments(source_sentences, "S")}

[한국어 번역문 문장 후보]
{_format_numbered_alignment_segments(translation_sentences, "T")}
"""


def _coerce_alignment_indexes(value) -> list[int]:
    if value is None:
        return []
    raw_items = value if isinstance(value, list) else [value]
    indexes: list[int] = []
    for item in raw_items:
        try:
            index = int(str(item).strip().lstrip("STst"))
        except Exception:
            continue
        if index > 0:
            indexes.append(index)
    return indexes


def _segments_from_indexes(indexes: list[int], segments: list[str], *, source: bool) -> str:
    selected: list[str] = []
    seen: set[int] = set()
    for index in indexes:
        if index in seen or index < 1 or index > len(segments):
            continue
        seen.add(index)
        selected.append(segments[index - 1])
    return _join_alignment_units(selected, source=source) if selected else ""


def _partition_alignment_indexes(indexes: list[int], group_count: int) -> list[list[int]]:
    if not indexes:
        return [[] for _ in range(group_count)]
    return _partition_alignment_units(indexes, min(group_count, len(indexes)))


def _split_wide_alignment_indexes(
    source_indexes: list[int], translation_indexes: list[int]
) -> list[tuple[list[int], list[int]]]:
    if not source_indexes or not translation_indexes:
        return [(source_indexes, translation_indexes)]

    max_source_indexes = int(os.getenv("ANTHROPIC_SYNTAX_ALIGN_MAX_SOURCE_INDEXES_PER_PAIR", "2"))
    max_translation_indexes = int(os.getenv("ANTHROPIC_SYNTAX_ALIGN_MAX_TRANSLATION_INDEXES_PER_PAIR", "4"))
    if (
        len(source_indexes) <= max_source_indexes
        and len(translation_indexes) <= max_translation_indexes
    ):
        return [(source_indexes, translation_indexes)]

    group_count = min(len(source_indexes), len(translation_indexes))
    source_groups = _partition_alignment_indexes(source_indexes, group_count)
    translation_groups = _partition_alignment_indexes(translation_indexes, group_count)
    return list(zip(source_groups, translation_groups))


def _is_punctuation_only_pair(pair: SyntaxAlignPair) -> bool:
    source = pair.source.strip()
    translation = pair.translation.strip()
    if not source and not translation:
        return False
    source_is_empty_or_punctuation = not source or _is_alignment_punctuation_only(source)
    translation_is_empty_or_punctuation = (
        not translation or _is_alignment_punctuation_only(translation)
    )
    return source_is_empty_or_punctuation and translation_is_empty_or_punctuation


def _merge_punctuation_only_pairs(pairs: list[SyntaxAlignPair]) -> list[SyntaxAlignPair]:
    merged: list[SyntaxAlignPair] = []
    pending_source_prefix = ""
    pending_translation_prefix = ""

    for pair in pairs:
        if _is_punctuation_only_pair(pair):
            if merged:
                previous = merged[-1]
                previous.source = _join_alignment_fragment(previous.source, pair.source)
                previous.translation = _join_alignment_fragment(
                    previous.translation,
                    pair.translation,
                )
            else:
                pending_source_prefix = _join_alignment_fragment(
                    pending_source_prefix,
                    pair.source,
                )
                pending_translation_prefix = _join_alignment_fragment(
                    pending_translation_prefix,
                    pair.translation,
                )
            continue

        if pending_source_prefix:
            pair.source = _join_alignment_fragment(
                pair.source,
                pending_source_prefix,
                prepend=True,
            )
            pending_source_prefix = ""
        if pending_translation_prefix:
            pair.translation = _join_alignment_fragment(
                pair.translation,
                pending_translation_prefix,
                prepend=True,
            )
            pending_translation_prefix = ""
        merged.append(pair)

    if merged:
        if pending_source_prefix:
            merged[-1].source = _join_alignment_fragment(merged[-1].source, pending_source_prefix)
        if pending_translation_prefix:
            merged[-1].translation = _join_alignment_fragment(
                merged[-1].translation,
                pending_translation_prefix,
            )

    return merged


def _normalize_syntax_alignment_pairs(
    parsed: dict,
    source_segments: list[str],
    translation_segments: list[str],
) -> list[SyntaxAlignPair]:
    pairs: list[SyntaxAlignPair] = []
    used_source_indexes: set[int] = set()
    used_translation_indexes: set[int] = set()
    for item in parsed.get("pairs", []):
        if not isinstance(item, dict):
            continue
        confidence = str(item.get("confidence", "medium")).strip().lower()
        if confidence not in {"high", "medium", "low"}:
            confidence = "medium"
        source_annotation = str(item.get("source_annotation", "") or "").strip()
        grammar_group = str(item.get("grammar_group", "") or "").strip()
        source_indexes = _coerce_alignment_indexes(
            item.get("source_indexes", item.get("source_ids", item.get("source_index")))
        )
        translation_indexes = _coerce_alignment_indexes(
            item.get("translation_indexes", item.get("translation_ids", item.get("translation_index")))
        )
        source_indexes = [
            index for index in source_indexes
            if index not in used_source_indexes
        ]
        translation_indexes = [
            index for index in translation_indexes
            if index not in used_translation_indexes
        ]
        index_groups = _split_wide_alignment_indexes(source_indexes, translation_indexes)
        pair_confidence = "low" if len(index_groups) > 1 else confidence
        for source_group, translation_group in index_groups:
            source = _segments_from_indexes(source_group, source_segments, source=True)
            translation = _segments_from_indexes(
                translation_group,
                translation_segments,
                source=False,
            )
            if not source and not translation and ("source" in item or "translation" in item):
                source = str(item.get("source", "") or "").strip()
                translation = str(item.get("translation", "") or "").strip()
            pair = SyntaxAlignPair(
                source=source,
                translation=translation,
                confidence=pair_confidence,
                source_annotation=source_annotation,
                grammar_group=grammar_group,
                source_order=min(source_group) if source_group else 0,
                translation_order=min(translation_group) if translation_group else 0,
            )
            if not pair.source or not pair.translation:
                pair.confidence = "low"
            if pair.source or pair.translation:
                pairs.append(pair)
                used_source_indexes.update(source_group)
                used_translation_indexes.update(translation_group)
    return _repair_syntax_alignment_metadata(_merge_punctuation_only_pairs(pairs))


def _normalize_sentence_alignment_rows(
    parsed: dict,
    source_sentences: list[str],
    translation_sentences: list[str],
) -> list[SyntaxAlignPair]:
    rows: list[SyntaxAlignPair] = []
    used_source_indexes: set[int] = set()
    used_translation_indexes: set[int] = set()
    raw_rows = parsed.get("rows", parsed.get("pairs", []))

    for item in raw_rows:
        if not isinstance(item, dict):
            continue
        confidence = str(item.get("confidence", "medium")).strip().lower()
        if confidence not in {"high", "medium", "low"}:
            confidence = "medium"
        source_indexes = _coerce_alignment_indexes(
            item.get("source_indexes", item.get("source_ids", item.get("source_index")))
        )
        translation_indexes = _coerce_alignment_indexes(
            item.get("translation_indexes", item.get("translation_ids", item.get("translation_index")))
        )
        source_indexes = [
            index for index in source_indexes
            if index not in used_source_indexes and 1 <= index <= len(source_sentences)
        ]
        translation_indexes = [
            index for index in translation_indexes
            if index not in used_translation_indexes and 1 <= index <= len(translation_sentences)
        ]
        if not source_indexes and not translation_indexes:
            continue

        source = _segments_from_indexes(source_indexes, source_sentences, source=True)
        translation = _segments_from_indexes(
            translation_indexes,
            translation_sentences,
            source=False,
        )
        row = SyntaxAlignPair(
            source=source,
            translation=translation,
            confidence=confidence,
            source_order=min(source_indexes) if source_indexes else 0,
            translation_order=min(translation_indexes) if translation_indexes else 0,
        )
        if not row.source or not row.translation:
            row.confidence = "low"
        rows.append(row)
        used_source_indexes.update(source_indexes)
        used_translation_indexes.update(translation_indexes)

    missing_source = [
        index for index in range(1, len(source_sentences) + 1)
        if index not in used_source_indexes
    ]
    missing_translation = [
        index for index in range(1, len(translation_sentences) + 1)
        if index not in used_translation_indexes
    ]
    for index in missing_source:
        rows.append(
            SyntaxAlignPair(
                source=source_sentences[index - 1],
                translation="",
                confidence="low",
                source_order=index,
            )
        )
    for index in missing_translation:
        rows.append(
            SyntaxAlignPair(
                source="",
                translation=translation_sentences[index - 1],
                confidence="low",
                translation_order=index,
            )
        )

    rows.sort(key=lambda row: (
        row.source_order or row.translation_order or 0,
        row.translation_order or 0,
    ))
    return _merge_punctuation_only_pairs(rows)


async def _request_syntax_alignment(
    client: anthropic.Anthropic,
    source_segments: list[str],
    translation_segments: list[str],
    local_pairs: list[SyntaxAlignPair],
) -> SyntaxAlignResponse:
    prompt = _build_syntax_alignment_prompt(source_segments, translation_segments)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model=os.getenv("ANTHROPIC_SYNTAX_ALIGN_MODEL", "claude-sonnet-4-5"),
            max_tokens=int(os.getenv("ANTHROPIC_SYNTAX_ALIGN_MAX_TOKENS", "8192")),
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        return SyntaxAlignResponse(pairs=local_pairs, model="local-fallback:auth-error")
    except Exception as exc:
        print(f"[syntax_align] API call failed, using local fallback: {exc}")
        return SyntaxAlignResponse(pairs=local_pairs, model="local-fallback:api-error")

    try:
        parsed = parse_json_object(message.content[0].text)
        pairs = _normalize_syntax_alignment_pairs(parsed, source_segments, translation_segments)
    except Exception as exc:
        print(f"[syntax_align] Result processing failed, using local fallback: {exc}")
        return SyntaxAlignResponse(pairs=local_pairs, model="local-fallback:result-error")

    if not pairs:
        return SyntaxAlignResponse(pairs=local_pairs, model="local-fallback:empty-ai-result")

    if _ai_pairs_need_heading_fallback(pairs):
        return SyntaxAlignResponse(pairs=local_pairs, model="local-fallback:heading-repair")

    return SyntaxAlignResponse(pairs=pairs, model=str(message.model or "unknown"))


async def _request_sentence_alignment(
    client: anthropic.Anthropic,
    source_sentences: list[str],
    translation_sentences: list[str],
    local_sentence_pairs: list[SyntaxAlignPair],
) -> tuple[list[SyntaxAlignPair], str]:
    if not source_sentences and not translation_sentences:
        return local_sentence_pairs, "local-fallback:no-sentences"

    prompt = _build_sentence_alignment_prompt(source_sentences, translation_sentences)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model=os.getenv("ANTHROPIC_SENTENCE_ALIGN_MODEL", "claude-sonnet-4-5"),
            max_tokens=int(os.getenv("ANTHROPIC_SENTENCE_ALIGN_MAX_TOKENS", "8192")),
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        return local_sentence_pairs, "local-fallback:auth-error"
    except Exception as exc:
        print(f"[sentence_align] API call failed, using local fallback: {exc}")
        return local_sentence_pairs, "local-fallback:api-error"

    try:
        parsed = parse_json_object(message.content[0].text)
        rows = _normalize_sentence_alignment_rows(
            parsed,
            source_sentences,
            translation_sentences,
        )
    except Exception as exc:
        print(f"[sentence_align] Result processing failed, using local fallback: {exc}")
        return local_sentence_pairs, "local-fallback:result-error"

    if not rows:
        return local_sentence_pairs, "local-fallback:empty-sentence-result"
    if _ai_pairs_need_heading_fallback(rows):
        return local_sentence_pairs, "local-fallback:heading-repair"

    return rows, str(message.model or "unknown")


async def _request_sentence_locked_syntax_alignment(
    client: anthropic.Anthropic,
    source_text: str,
    translation_text: str,
    local_sentence_pairs: list[SyntaxAlignPair],
) -> SyntaxAlignResponse:
    source_sentences = _split_alignment_sentences(source_text, source=True)
    translation_sentences = _split_alignment_sentences(translation_text, source=False)
    sentence_align_max_chars = int(os.getenv("ANTHROPIC_SENTENCE_ALIGN_MAX_CHARS", "24000"))

    if len(source_text) + len(translation_text) > sentence_align_max_chars:
        sentence_pairs = local_sentence_pairs
        model = "local-fallback:sentence-align-too-large"
    else:
        sentence_pairs, model = await _request_sentence_alignment(
            client,
            source_sentences,
            translation_sentences,
            local_sentence_pairs,
        )

    return SyntaxAlignResponse(
        pairs=_expand_sentence_pairs_to_syntax_pairs(sentence_pairs),
        model=f"{model}+sentence-locked",
    )


def _chunk_sentence_pairs(
    sentence_pairs: list[SyntaxAlignPair], chunk_chars: int
) -> list[list[SyntaxAlignPair]]:
    chunks: list[list[SyntaxAlignPair]] = []
    current: list[SyntaxAlignPair] = []
    current_chars = 0

    for pair in sentence_pairs:
        pair_chars = len(pair.source) + len(pair.translation)
        if current and current_chars + pair_chars > chunk_chars:
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(pair)
        current_chars += pair_chars

    if current:
        chunks.append(current)
    return chunks


def _split_alignment_lines(text: str) -> list[str]:
    return [
        line.strip()
        for line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
        if line.strip()
    ]


def _split_lines_into_balanced_chunks(lines: list[str], chunk_count: int) -> list[list[str]]:
    if chunk_count <= 1 or len(lines) <= 1:
        return [lines] if lines else []

    total_chars = sum(len(line) for line in lines)
    target_chars = max(1, total_chars / chunk_count)
    chunks: list[list[str]] = []
    current: list[str] = []
    current_chars = 0

    for index, line in enumerate(lines):
        remaining_lines = len(lines) - index
        remaining_chunks = chunk_count - len(chunks) - 1
        if (
            current
            and current_chars >= target_chars
            and remaining_chunks > 0
            and remaining_lines > remaining_chunks
        ):
            chunks.append(current)
            current = []
            current_chars = 0
        current.append(line)
        current_chars += len(line)

    if current:
        chunks.append(current)
    return chunks


def _chunk_alignment_texts(
    source_text: str,
    translation_text: str,
    chunk_chars: int,
) -> list[tuple[str, str]]:
    source_lines = _split_alignment_lines(source_text)
    translation_lines = _split_alignment_lines(translation_text)
    leading_translation_headings: list[str] = []
    while translation_lines and _is_translation_heading(translation_lines[0]):
        leading_translation_headings.append(translation_lines.pop(0))

    source_len = sum(len(line) for line in source_lines)
    translation_len = sum(len(line) for line in translation_lines)
    chunk_count = max(1, int(max(source_len, translation_len) / max(chunk_chars, 500)) + 1)
    source_chunks = _split_lines_into_balanced_chunks(source_lines, chunk_count)
    translation_chunks = _split_lines_into_balanced_chunks(translation_lines, chunk_count)
    chunk_count = max(len(source_chunks), len(translation_chunks), 1)

    chunks: list[tuple[str, str]] = []
    for index in range(chunk_count):
        source_chunk_lines = source_chunks[index] if index < len(source_chunks) else []
        translation_chunk_lines = translation_chunks[index] if index < len(translation_chunks) else []
        if index == 0 and leading_translation_headings:
            translation_chunk_lines = leading_translation_headings + translation_chunk_lines
        chunks.append((
            "\n".join(source_chunk_lines),
            "\n".join(translation_chunk_lines),
        ))
    return chunks


def _sentence_pairs_to_text(sentence_pairs: list[SyntaxAlignPair]) -> tuple[str, str]:
    source_text = "\n".join(pair.source for pair in sentence_pairs if pair.source)
    translation_text = "\n".join(pair.translation for pair in sentence_pairs if pair.translation)
    return source_text, translation_text


def _summarize_syntax_alignment_models(models: list[str]) -> str:
    ai_models = [model for model in models if not model.startswith("local-fallback")]
    if not ai_models:
        return "local-fallback:chunked"
    suffix = "+partial-local" if len(ai_models) != len(models) else ""
    return f"{ai_models[0]}+chunked{suffix}"


async def _request_chunked_syntax_alignment(
    client: anthropic.Anthropic,
    source_text: str,
    translation_text: str,
    chunk_chars: int,
    max_chunks: int,
) -> SyntaxAlignResponse:
    chunks = _chunk_alignment_texts(source_text, translation_text, max(chunk_chars, 500))
    combined_pairs: list[SyntaxAlignPair] = []
    models: list[str] = []

    for index, (source_chunk_text, translation_chunk_text) in enumerate(chunks):
        local_pairs = build_local_syntax_alignment(source_chunk_text, translation_chunk_text)
        if index >= max_chunks:
            combined_pairs.extend(local_pairs)
            models.append("local-fallback:chunk-limit")
            continue

        source_segments = _split_alignment_phrases(source_chunk_text, source=True)
        translation_segments = _split_alignment_phrases(translation_chunk_text, source=False)
        response = await _request_syntax_alignment(
            client,
            source_segments,
            translation_segments,
            local_pairs,
        )
        combined_pairs.extend(response.pairs)
        models.append(response.model)

    return SyntaxAlignResponse(
        pairs=combined_pairs,
        model=_summarize_syntax_alignment_models(models),
    )


@router.post("/", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    """중국어 원문 → 한국어 번역 (문화 판단 + 주석 포함)"""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")

    glossary_hits, reference_examples, confirmed_record_count = load_translation_memory_context(
        book=req.book,
        source_text=req.text,
        prev_chapter_id=req.prev_chapter_id,
    )
    glossary_text = build_prompt_glossary_table(glossary_hits)
    style_guide_text = load_style_guide_filtered()
    prev_sample = load_prev_chapter_sample(req.prev_chapter_id or "")
    reference_examples_text = build_prompt_reference_examples(reference_examples)

    system_prompt = build_system_prompt(
        era_profile=req.era_profile,
        genre=req.genre or [],
        glossary_text=glossary_text,
        style_guide_text=style_guide_text,
        prev_sample=prev_sample,
        reference_examples_text=reference_examples_text,
        with_annotations=req.with_annotations,
        with_cultural_check=req.with_cultural_check,
    )

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model=os.getenv("ANTHROPIC_TRANSLATE_MODEL", "claude-opus-4-5"),
            max_tokens=int(os.getenv("ANTHROPIC_TRANSLATE_MAX_TOKENS", "8192")),
            system=system_prompt,
            messages=[{"role": "user", "content": f"다음 원문을 번역하세요:\n\n{req.text}"}]
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Anthropic API key invalid")
    except HTTPException:
        raise
    except Exception as exc:
        raise_anthropic_api_error(exc, "Translate")

    raw = message.content[0].text

    # 파싱
    annotations_raw = parse_json_block(raw, "annotations")
    cultural_flags_raw = parse_json_block(raw, "cultural_flags")
    translated = sanitize_korean_translation_punctuation(strip_json_blocks(raw))

    # 사용된 용어
    terms_used = [hit["term_zh"] for hit in glossary_hits]

    # 모델 검증
    annotations = []
    for a in annotations_raw:
        try:
            annotations.append(Annotation(**a))
        except Exception:
            pass

    cultural_flags = []
    for c in cultural_flags_raw:
        try:
            cultural_flags.append(CulturalFlag(**c))
        except Exception:
            pass

    return TranslateResponse(
        translated=translated,
        terms_used=terms_used,
        annotations=annotations,
        cultural_flags=cultural_flags,
        glossary_hits=[GlossaryHit(**hit) for hit in glossary_hits],
        reference_examples=[ReferenceExample(**example) for example in reference_examples],
        context_summary=TranslationContextSummary(
            confirmed_records=confirmed_record_count,
            glossary_hits=len(glossary_hits),
            reference_examples=len(reference_examples),
        ),
        model=message.model
    )


@router.post("/explain-sentence", response_model=SentenceExplainResponse)
async def explain_sentence(req: SentenceExplainRequest):
    """편집 중인 한 문장의 문법/어휘/배경 설명을 간결하게 생성한다."""
    source_text = req.source_text.strip()
    translation_text = req.translation_text.strip()
    if not source_text:
        raise HTTPException(status_code=400, detail="source_text는 필수입니다.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")

    glossary_hits, reference_examples, _ = load_translation_memory_context(
        book=req.book,
        source_text=source_text,
        prev_chapter_id=None,
    )
    glossary_text = build_prompt_glossary_table(glossary_hits)
    reference_examples_text = build_prompt_reference_examples(reference_examples[:3])
    genre_str = "/".join(req.genre or []) if req.genre else "고장극"

    prompt = f"""다음 중국어 원문 문장을 한국어 독자가 학습할 수 있게 설명하세요.

조건:
- 한국어로만 답하세요.
- 길이는 4~7줄.
- 문법 포인트, 핵심 단어/구, 배경/뉘앙스를 구분해 간결하게 설명하세요.
- 번역문이 있으면 자연스러운 번역인지 짧게 점검하세요.
- 모르는 배경은 단정하지 말고 "추정"이라고 표시하세요.
- 새 번역문을 길게 다시 쓰지 마세요.

작품: {req.book or "미지정"}
장르: {genre_str}
시대 배경: {req.era_profile}

[원문]
{source_text}

[현재 번역]
{translation_text or "(없음)"}

[관련 용어]
{glossary_text}

[참고 확정 예문]
{reference_examples_text}
"""

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model=os.getenv("ANTHROPIC_EXPLAIN_MODEL", "claude-sonnet-4-5"),
            max_tokens=int(os.getenv("ANTHROPIC_EXPLAIN_MAX_TOKENS", "900")),
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Anthropic API key invalid")
    except HTTPException:
        raise
    except Exception as exc:
        raise_anthropic_api_error(exc, "Explain")

    explanation = str(message.content[0].text or "").strip()
    return SentenceExplainResponse(
        explanation=explanation,
        model=str(message.model or "unknown"),
    )


TONE_PRESET_DESCRIPTIONS = {
    "haoche": "하오체. 고풍스럽고 품위 있는 존대. 예: 하오, 하시오, 것이오, 아니오.",
    "hasipsioche": "하십시오체. 격식 있고 현대적인 높임말. 예: 합니다, 하십시오, 아닙니다.",
    "haeyoche": "해요체. 부드럽고 일상적인 높임말. 예: 해요, 하세요, 아니에요.",
    "banmal": "반말. 친근하거나 낮춰 말하는 구어체. 예: 해, 하지 마, 아니야.",
    "literary": "문어체 서술. 대사가 아닌 서술문처럼 담백하고 품격 있게 정리.",
}


@router.post("/rewrite-tone", response_model=ToneRewriteResponse)
async def rewrite_tone(req: ToneRewriteRequest):
    """문장 편집 row의 한국어 번역문 말투만 지정 프리셋으로 보정한다."""
    translation_text = req.translation_text.strip()
    if not translation_text:
        raise HTTPException(status_code=400, detail="translation_text는 필수입니다.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")

    target_tone = req.target_tone.strip() or "haoche"
    tone_description = TONE_PRESET_DESCRIPTIONS.get(target_tone, target_tone)
    genre_str = "/".join(req.genre or []) if req.genre else "고장극"
    glossary_hits, reference_examples, _ = load_translation_memory_context(
        book=req.book,
        source_text=req.source_text or translation_text,
        prev_chapter_id=None,
    )
    reference_examples_text = build_prompt_reference_examples(reference_examples[:3])

    prompt = f"""아래 한국어 번역문의 말투만 지정한 말투로 바꾸세요.

규칙:
- 출력은 수정된 한국어 문장만 반환하세요. 설명, 따옴표 감싸기, 마크다운 금지.
- 의미, 사실관계, 인물 관계, 고유명사, 용어 번역은 바꾸지 마세요.
- 원문에 없는 정보를 추가하지 마세요.
- 한국어 번역문에는 엠대시/엔대시/가로줄 계열 문장부호를 쓰지 마세요.
  금지 문자: —, –, ―, ─, --.
- 문장부호는 한국어에 자연스러운 쉼표, 마침표, 물음표, 느낌표, 말줄임표만 사용하세요.
- 같은 작품 확정 예문이 있으면 인물 말투와 호칭의 일관성을 참고하세요.

작품: {req.book or "미지정"}
장르: {genre_str}
시대 배경: {req.era_profile}
목표 말투: {tone_description}

[중국어 원문 참고]
{req.source_text.strip() or "(없음)"}

[현재 한국어 번역]
{translation_text}

[같은 작품 확정 예문]
{reference_examples_text}
"""

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model=os.getenv("ANTHROPIC_TONE_MODEL", os.getenv("ANTHROPIC_EXPLAIN_MODEL", "claude-sonnet-4-5")),
            max_tokens=int(os.getenv("ANTHROPIC_TONE_MAX_TOKENS", "900")),
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Anthropic API key invalid")
    except HTTPException:
        raise
    except Exception as exc:
        raise_anthropic_api_error(exc, "Tone rewrite")

    rewritten = sanitize_korean_translation_punctuation(str(message.content[0].text or "").strip())
    return ToneRewriteResponse(
        rewritten=rewritten,
        model=str(message.model or "unknown"),
    )


@router.post("/verify-draft", response_model=DraftVerifyResponse)
async def verify_draft(req: DraftVerifyRequest):
    """원문과 번역 초안을 전체 품질 기준으로 검증한다."""
    source_text = req.source_text.strip()
    translation_text = req.translation_text.strip()
    if not source_text or not translation_text:
        raise HTTPException(status_code=400, detail="source_text와 translation_text는 필수입니다.")

    max_input_chars = int(os.getenv("ANTHROPIC_VERIFY_MAX_INPUT_CHARS", "50000"))
    if len(source_text) + len(translation_text) > max_input_chars:
        raise HTTPException(
            status_code=413,
            detail=(
                "검증할 텍스트가 너무 깁니다. "
                f"현재 {len(source_text) + len(translation_text)}자, 제한 {max_input_chars}자입니다."
            ),
        )

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")

    glossary_hits, reference_examples, _ = load_translation_memory_context(
        book=req.book,
        source_text=source_text,
        prev_chapter_id=None,
    )
    prompt = build_draft_verify_prompt(
        source_text=source_text,
        translation_text=translation_text,
        book=req.book,
        genre=req.genre or [],
        era_profile=req.era_profile,
        glossary_text=build_prompt_glossary_table(glossary_hits),
        style_guide_text=load_style_guide_filtered(),
        reference_examples_text=build_prompt_reference_examples(reference_examples[:5]),
    )

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model=os.getenv("ANTHROPIC_VERIFY_MODEL", os.getenv("ANTHROPIC_EXPLAIN_MODEL", "claude-sonnet-4-5")),
            max_tokens=int(os.getenv("ANTHROPIC_VERIFY_MAX_TOKENS", "3500")),
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Anthropic API key invalid")
    except HTTPException:
        raise
    except Exception as exc:
        raise_anthropic_api_error(exc, "Draft verification")

    raw = str(message.content[0].text or "").strip()
    try:
        parsed = parse_json_object(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Draft verification result was not valid JSON: {exc}",
        ) from exc
    return normalize_draft_verify_response(
        parsed,
        model=str(message.model or "unknown"),
        translation_text=translation_text,
    )


@router.post("/syntax-align", response_model=SyntaxAlignResponse)
async def syntax_align(req: SyntaxAlignRequest):
    """원문/번역문을 검수용 구문 단위로 AI 정렬한다."""
    if not req.source_text.strip() or not req.translation_text.strip():
        raise HTTPException(status_code=400, detail="source_text와 translation_text는 필수입니다.")

    source_text = req.source_text.strip()
    translation_text = req.translation_text.strip()
    sentence_pairs = _build_sentence_alignment_pairs(source_text, translation_text)
    local_pairs = _expand_sentence_pairs_to_syntax_pairs(sentence_pairs)
    if not local_pairs:
        raise HTTPException(status_code=400, detail="정렬할 문장을 찾을 수 없습니다.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return SyntaxAlignResponse(pairs=local_pairs, model="local-fallback:no-api-key")

    client = anthropic.Anthropic(api_key=api_key)
    return await _request_sentence_locked_syntax_alignment(
        client,
        source_text,
        translation_text,
        sentence_pairs,
    )


@router.post("/test")
async def translate_test():
    """API 연결 테스트용"""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")
    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = await anthropic_create_with_timeout(
            client,
            model="claude-haiku-4-5",
            max_tokens=50,
            messages=[{"role": "user", "content": "안녕이라고 짧게 대답해"}]
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Anthropic API key invalid")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Translate test failed: {exc}")
    return {"ok": True, "response": message.content[0].text}
