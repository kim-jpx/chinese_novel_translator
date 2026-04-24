"""Upload pipeline router - 번역 텍스트 업로드 → 데이터셋 자동 누적."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import html
import json
import os
import re
import threading
import uuid
from typing import Optional, List, Literal
import urllib.request
import asyncio
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel, Field

from backend.llm import generate_text_sync
from backend.storage.alignment_batch_store import SQLiteAlignmentBatchStore
from backend.storage.alignment_review_store import (
    SQLiteAlignmentReviewStore,
    make_alignment_review_id,
)
from backend.storage.config import get_dataset_backend, get_job_store_path
from backend.storage.chapter_alignment import align_ko_chapters_by_zh, build_ko_pool
from backend.storage.dataset_repository import (
    DatasetBackendUnavailableError,
    DatasetRepositoryError,
    canonical_pair_for_values,
    get_dataset_repository,
)
from backend.storage.dataset_utils import (
    build_canonical_pair_key,
    detect_script,
    expand_chapter_zh,
    normalize_book_key,
    utc_now_iso,
)
from backend.storage.glossary_store import (
    backfill_glossary_term_meanings,
    load_glossary,
    save_glossary,
)
from backend.storage.job_store import SQLiteJobStore

router = APIRouter()
JOB_TTL_SECONDS = int(os.getenv("UPLOAD_JOB_TTL_SECONDS", "3600"))
MAX_JOB_ENTRIES = int(os.getenv("UPLOAD_JOB_MAX_ENTRIES", "200"))
JOB_TYPE_UPLOAD = "upload"
JOB_TYPE_EXTRACT = "extract"
JOB_STORE = SQLiteJobStore(get_job_store_path())
ALIGNMENT_REVIEW_STORE = SQLiteAlignmentReviewStore(get_job_store_path())
ALIGNMENT_BATCH_STORE = SQLiteAlignmentBatchStore(get_job_store_path())
ALIGNMENT_CONFIDENCE_THRESHOLD = float(os.getenv("ALIGNMENT_CONFIDENCE_THRESHOLD", "0.78"))

# 작품별 원문 소스 매핑
BOOK_SOURCE_CATALOG = [
    {
        "book_zh": "庶女明兰传",
        "book_ko": "명란전",
        "aliases": ["庶女明兰传", "명란전"],
        "base_url": "https://www.shuzhaige.com/1230/",
        "chapter_url_fn": lambda ch: f"https://www.shuzhaige.com/1230/{178220 + ch}.html",
        "parser": "shuzhaige",
        "genre": ["고장극", "가문정치", "언정"],
        "era_profile": "ancient",
    },
    {
        "book_zh": "至尊神医之帝君要下嫁",
        "book_ko": "지존신의",
        "aliases": ["至尊神医之帝君要下嫁", "지존신의"],
        "base_url": "https://www.shuqi.com/reader?bid=9015656",
        "chapter_url_fn": lambda ch: f"https://www.shuqi.com/reader?bid=9015656&cid={2199164 + ch}",
        "parser": "shuqi_meta_only",
        "genre": ["현대판타지", "신의/의술", "환생", "무협요소"],
        "era_profile": "mixed",
    },
    {
        "book_zh": "天才小毒妃",
        "book_ko": "천재소독비",
        "aliases": ["天才小毒妃", "천재소독비"],
        "base_url": "",
        "chapter_url_fn": lambda ch: "",
        "parser": "none",
        "genre": ["고장극", "의술", "궁중암투", "언정"],
        "era_profile": "ancient",
    },
]


def _normalize_title_key(title: str) -> str:
    return normalize_book_key("", "", title)


def _build_supported_book_aliases() -> dict[str, dict]:
    aliases: dict[str, dict] = {}
    for entry in BOOK_SOURCE_CATALOG:
        candidates = {
            str(entry.get("book_zh", "")).strip(),
            str(entry.get("book_ko", "")).strip(),
            *(str(alias).strip() for alias in entry.get("aliases", [])),
        }
        for candidate in candidates:
            normalized = _normalize_title_key(candidate)
            if normalized:
                aliases[normalized] = entry
    return aliases


BOOK_SOURCES_BY_ALIAS = _build_supported_book_aliases()


def resolve_supported_book(book_zh: str, book_ko: str, book: str) -> Optional[dict]:
    for candidate in (book_zh, book_ko, book):
        normalized = _normalize_title_key(candidate)
        if normalized and normalized in BOOK_SOURCES_BY_ALIAS:
            return BOOK_SOURCES_BY_ALIAS[normalized]
    return None


class UploadConflict(BaseModel):
    record_id: str
    book: str
    chapter_ko: int
    chapter_zh: str
    field: Literal["zh_text", "ko_text"]
    existing_value: str
    incoming_value: str


class AlignmentReview(BaseModel):
    review_id: str = ""
    record_id: str
    book: str
    chapter_ko: int
    chapter_zh: str
    existing_ko_text: str
    proposed_ko_text: str
    batch_id: str = ""
    batch_label: str = ""
    batch_index: int = 0
    batch_total: int = 0
    confidence: float
    warnings: List[str] = Field(default_factory=list)
    start_reason: str = ""
    end_reason: str = ""
    created_at: str = ""


class AlignmentReviewUpdateRequest(BaseModel):
    proposed_ko_text: str | None = None
    start_reason: str | None = None
    end_reason: str | None = None


class UploadLlmOptionsRequest(BaseModel):
    provider: str = ""
    model: str = ""


class AlignmentReviewApplyRequest(UploadLlmOptionsRequest):
    proposed_ko_text: str | None = None


class AlignmentReviewBoundaryAdjustRequest(BaseModel):
    direction: Literal[
        "send_start_to_prev",
        "send_end_to_next",
        "pull_from_prev",
        "pull_from_next",
    ]


class UploadResult(BaseModel):
    id: str
    book: str
    chapter: int
    zh_fetched: bool
    new_terms: List[str] = Field(default_factory=list)
    status: str
    created_count: int = 1
    created_chapters: List[int] = Field(default_factory=list)
    zh_fetched_any: bool = False
    zh_fetched_all: bool = False
    source_fetch_mode: str = "not_configured"
    upserted_count: int = 0
    merged_count: int = 0
    conflict_count: int = 0
    conflicts: List[UploadConflict] = Field(default_factory=list)
    alignment_applied_count: int = 0
    alignment_review_count: int = 0
    alignment_reviews: List[AlignmentReview] = Field(default_factory=list)


def get_repository():
    try:
        return get_dataset_repository()
    except DatasetBackendUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _prune_job_store(job_type: str):
    JOB_STORE.prune(job_type=job_type, ttl_seconds=JOB_TTL_SECONDS, max_entries=MAX_JOB_ENTRIES)


def _queue_job(job_type: str) -> str:
    _prune_job_store(job_type)
    return JOB_STORE.create_job(job_type=job_type)


def _set_job_status(
    job_type: str,
    job_id: str,
    *,
    status: str,
    result: dict | None = None,
    error: str | None = None,
):
    JOB_STORE.update_job(job_id=job_id, status=status, result=result, error=error)


def _get_job(job_type: str, job_id: str, *, include_id: bool = False) -> dict | None:
    _prune_job_store(job_type)
    job = JOB_STORE.get_job(job_id=job_id, job_type=job_type)
    if not job:
        return None
    if include_id:
        return job
    return {
        "status": job["status"],
        "result": job["result"],
        "error": job["error"],
        "created_at": job["created_at"],
    }


def _list_jobs(job_type: str, limit: int) -> list[dict]:
    _prune_job_store(job_type)
    return JOB_STORE.list_jobs(job_type=job_type, limit=limit)


def _build_alignment_review(review: dict) -> AlignmentReview:
    return AlignmentReview(
        review_id=str(review.get("review_id", "") or ""),
        record_id=str(review.get("record_id", "") or ""),
        book=str(review.get("book", "") or ""),
        chapter_ko=int(review.get("chapter_ko", 0) or 0),
        chapter_zh=str(review.get("chapter_zh", "") or ""),
        existing_ko_text=str(review.get("existing_ko_text", "") or ""),
        proposed_ko_text=str(review.get("proposed_ko_text", "") or ""),
        batch_id=str(review.get("batch_id", "") or ""),
        batch_label=str(review.get("batch_label", "") or ""),
        batch_index=int(review.get("batch_index", 0) or 0),
        batch_total=int(review.get("batch_total", 0) or 0),
        confidence=float(review.get("confidence", 0) or 0),
        warnings=[str(item) for item in review.get("warnings", [])],
        start_reason=str(review.get("start_reason", "") or ""),
        end_reason=str(review.get("end_reason", "") or ""),
        created_at=str(review.get("created_at", "") or ""),
    )


def _format_alignment_batch_label(chapter_values: list[int]) -> str:
    unique_values = sorted({int(value) for value in chapter_values if int(value) > 0})
    if not unique_values:
        return ""
    if len(unique_values) == 1:
        return str(unique_values[0])
    is_contiguous = all(
        unique_values[index] == unique_values[index - 1] + 1
        for index in range(1, len(unique_values))
    )
    if is_contiguous:
        return f"{unique_values[0]}-{unique_values[-1]}"
    return ",".join(str(value) for value in unique_values)


def _split_alignment_units(text: str) -> list[str]:
    lines = [line.strip() for line in str(text or "").splitlines() if line.strip()]
    if len(lines) >= 2:
        return lines
    collapsed = str(text or "").strip()
    if not collapsed:
        return []
    sentences = [
        chunk.strip()
        for chunk in re.split(r"(?<=[.!?。！？…])\s+|(?<=[.!?。！？…])(?=[^\s])", collapsed)
        if chunk.strip()
    ]
    if len(sentences) >= 2:
        return sentences
    return [collapsed]


def _join_alignment_units(units: list[str]) -> str:
    return clean_chapter_text("\n".join(unit.strip() for unit in units if unit.strip()), "ko")


def _parse_llm_json(raw_text: str, expected: Literal["array", "object"]):
    payload = str(raw_text or "").strip()
    if not payload:
        return None

    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", payload, re.S | re.I)
    if fence_match:
        payload = fence_match.group(1).strip()

    pattern = r"\[(?:.|\n)*\]" if expected == "array" else r"\{(?:.|\n)*\}"
    match = re.search(pattern, payload)
    candidate = match.group(0) if match else payload
    try:
        parsed = json.loads(candidate)
    except Exception:
        return None

    if expected == "array":
        return parsed if isinstance(parsed, list) else None
    return parsed if isinstance(parsed, dict) else None


def _generate_upload_llm_text(
    prompt: str,
    *,
    action: str,
    max_output_tokens: int,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> str:
    response = generate_text_sync(
        task="upload",
        action=action,
        user_prompt=prompt,
        requested_provider=requested_provider,
        requested_model=requested_model,
        max_output_tokens=max_output_tokens,
        temperature=0,
    )
    return response.text.strip()


def _persist_created_record(repo, records: list[dict], record: dict) -> dict:
    if get_dataset_backend() == "file":
        records.append(record)
        save_dataset(records)
        return record
    return repo.create_record(record)


def _persist_updated_record(
    repo,
    records: list[dict],
    record_index_by_id: dict[str, int],
    record_id: str,
    record: dict,
) -> dict:
    if get_dataset_backend() == "file":
        records[record_index_by_id[record_id]] = record
        save_dataset(records)
        return record
    return repo.update_record(record_id, record)


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


def extract_new_terms(
    ko_text: str,
    zh_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> List[str]:
    """기존 glossary에 없는 한자 용어 후보 추출 (규칙+LLM 혼합)"""
    glossary = load_glossary()
    existing = {term["term_zh"] for term in glossary}

    # 규칙 기반 후보: 한자 구간 n-gram(2~6) 빈도 집계
    candidates: List[str] = []
    zh_segments = re.findall(r'[\u4e00-\u9fff]+', zh_text)
    for segment in zh_segments:
        max_n = min(6, len(segment))
        for n in range(2, max_n + 1):
            for i in range(0, len(segment) - n + 1):
                candidates.append(segment[i:i + n])

    freq: dict[str, int] = {}
    for c in candidates:
        freq[c] = freq.get(c, 0) + 1

    stop_terms = {"于是", "但是", "因为", "所以", "如果", "他们", "我们", "你们", "自己", "这个", "那个", "说道", "看着"}
    regex_terms = [
        t for t, cnt in sorted(freq.items(), key=lambda item: (item[1], len(item[0])), reverse=True)
        if cnt >= 2 and len(t) >= 3 and t not in existing and t not in stop_terms
    ]

    llm_terms: List[str] = []
    if zh_text.strip() and ko_text.strip():
        llm_terms = extract_terms_with_llm(
            ko_text,
            zh_text,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )

    merged = []
    seen = set()
    for term in llm_terms + regex_terms:
        cleaned = term.strip()
        if not cleaned or cleaned in seen or cleaned in existing:
            continue
        if not re.fullmatch(r"[\u4e00-\u9fff]{2,10}", cleaned):
            continue
        seen.add(cleaned)
        merged.append(cleaned)
    return merged[:30]


def extract_terms_with_llm(
    ko_text: str,
    zh_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> List[str]:
    prompt = (
        "다음 중국어 원문과 한국어 번역문에서 고유명사/무협용어/의술용어/지명/직함 위주 중국어 용어만 추려라.\n"
        "반드시 JSON 배열만 출력하라. 예: [\"赤霄剑\",\"天方圣鼎\"]\n"
        "일반 대명사/접속사는 제외.\n\n"
        f"[ZH]\n{zh_text[:5000]}\n\n[KO]\n{ko_text[:5000]}"
    )
    try:
        raw = _generate_upload_llm_text(
            prompt,
            action="Upload glossary candidate extraction",
            max_output_tokens=600,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
        parsed = _parse_llm_json(raw, "array")
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except Exception:
        return []
    return []


def align_parallel_segments(
    zh_text: str,
    ko_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> tuple[str, str]:
    """ZH/KO 본문 앞뒤 잡음을 제거하고 겹치는 서사 구간으로 정렬."""
    if not zh_text.strip() or not ko_text.strip():
        return zh_text, ko_text

    prompt = (
        "중국어 원문과 한국어 번역문이 같은 장면에서 시작/끝나도록 본문 구간만 정리하라.\n"
        "두 텍스트는 반드시 같은 사건의 첫 문장에서 함께 시작하고 같은 사건의 마지막 문장에서 함께 끝나야 한다.\n"
        "광고/사이트 헤더/목차/작품명 반복 문구/회차표기(예: 第20章, 20화, 원문회차표기)는 제거하라.\n"
        "의미를 바꾸지 말고 잘라내기만 하라.\n"
        "출력 텍스트의 첫 줄과 마지막 줄은 반드시 본문 문장이어야 한다.\n"
        "반드시 JSON 객체만 출력:\n"
        "{\"zh_text\":\"...\",\"ko_text\":\"...\"}\n\n"
        f"[ZH]\n{zh_text[:7000]}\n\n[KO]\n{ko_text[:7000]}"
    )
    try:
        raw = _generate_upload_llm_text(
            prompt,
            action="Upload source/translation alignment cleanup",
            max_output_tokens=1500,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
        data = _parse_llm_json(raw, "object")
        aligned_zh = clean_chapter_text(str(data.get("zh_text", "")).strip(), "zh")
        aligned_ko = clean_chapter_text(str(data.get("ko_text", "")).strip(), "ko")
        if aligned_zh and aligned_ko:
            if len(aligned_zh) >= max(80, int(len(zh_text) * 0.15)) and len(aligned_ko) >= max(80, int(len(ko_text) * 0.15)):
                return aligned_zh, aligned_ko
    except Exception:
        return zh_text, ko_text
    return zh_text, ko_text


def split_ko_with_overflow_by_zh(
    zh_text: str,
    ko_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> tuple[str, str, str]:
    """
    KO 본문을 ZH 동일 회차 경계 기준으로
    prev/current/next 3구간으로 분리.
    """
    if not zh_text.strip() or not ko_text.strip():
        return "", ko_text, ""

    prompt = (
        "중국어 원문(한 회차 기준)과 한국어 텍스트를 비교해 한국어를 3구간으로 분리하라.\n"
        "규칙:\n"
        "1) prev_ko: 중국어 동일 회차 시작 문장 이전 내용(이전 회차로 보내야 함)\n"
        "2) current_ko: 중국어 동일 회차와 정확히 대응되는 본문\n"
        "3) next_ko: 중국어 동일 회차 마지막 문장 이후 내용(다음 회차로 보내야 함)\n"
        "4) 의미를 바꾸지 말고 분리만 하라\n"
        "반드시 JSON 객체만 출력:\n"
        "{\"prev_ko\":\"...\",\"current_ko\":\"...\",\"next_ko\":\"...\"}\n\n"
        f"[ZH_CHAPTER]\n{zh_text[:7000]}\n\n[KO_RAW]\n{ko_text[:7000]}"
    )
    try:
        raw = _generate_upload_llm_text(
            prompt,
            action="Upload chapter boundary split",
            max_output_tokens=1800,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
        data = _parse_llm_json(raw, "object")
        prev_ko = clean_chapter_text(str(data.get("prev_ko", "")).strip(), "ko")
        current_ko = clean_chapter_text(str(data.get("current_ko", "")).strip(), "ko")
        next_ko = clean_chapter_text(str(data.get("next_ko", "")).strip(), "ko")
        if current_ko:
            return prev_ko, current_ko, next_ko
    except Exception:
        return "", ko_text, ""
    return "", ko_text, ""


def _extract_new_terms_with_overrides(
    ko_text: str,
    zh_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> List[str]:
    if requested_provider or requested_model:
        return extract_new_terms(
            ko_text,
            zh_text,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
    return extract_new_terms(ko_text, zh_text)


def _align_parallel_segments_with_overrides(
    zh_text: str,
    ko_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> tuple[str, str]:
    if requested_provider or requested_model:
        return align_parallel_segments(
            zh_text,
            ko_text,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
    return align_parallel_segments(zh_text, ko_text)


def _split_ko_with_overrides(
    zh_text: str,
    ko_text: str,
    *,
    requested_provider: str | None = None,
    requested_model: str | None = None,
) -> tuple[str, str, str]:
    if requested_provider or requested_model:
        return split_ko_with_overflow_by_zh(
            zh_text,
            ko_text,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
    return split_ko_with_overflow_by_zh(zh_text, ko_text)


def load_dataset(
    *,
    book: str | None = None,
    chapter_ko: int | None = None,
    chapter_zh: str | None = None,
) -> List[dict]:
    return get_repository().list_records(book=book, chapter_ko=chapter_ko, chapter_zh=chapter_zh)


def save_dataset(records: List[dict]):
    get_repository().replace_all(records)


def append_merge_conflict_note(existing_notes: str, field_name: str, incoming_value: str) -> str:
    if not incoming_value:
        return existing_notes
    stamp = datetime.now(timezone.utc).isoformat()
    addition = f"[merge_conflict:{field_name}] kept existing, incoming skipped at {stamp}"
    if not existing_notes:
        return addition
    return f"{existing_notes}\n{addition}"


def clean_chapter_text(text: str, language: Literal["ko", "zh"]) -> str:
    """본문 저장 전 메타/헤더 라인 제거."""
    if not text:
        return ""

    def is_noise_line(line: str, lang: Literal["ko", "zh"]) -> bool:
        if not line:
            return True
        lowered = line.lower()
        if line.startswith("[") and line.endswith("]"):
            return True
        if lowered.startswith("title:") or line.startswith("제목:"):
            return True
        if lowered.startswith("url") or "http://" in lowered or "https://" in lowered:
            return True
        if "booktoki" in lowered or "북토끼" in line:
            return True
        if re.fullmatch(r"[─—\-_=]{5,}", line):
            return True
        if re.fullmatch(r"#{1,3}\s*\d+", line):
            return True
        if re.fullmatch(r"제?\s*\d+\s*화.*", line):
            return True
        if re.fullmatch(r"\d+\s*화.*", line):
            return True
        if re.fullmatch(r"第\s*\d+\s*[章节回节].*", line):
            return True
        if re.fullmatch(r"원문회차표기[:：].*", line):
            return True
        if lang == "zh" and ("字體大小" in line or "字体大小" in line):
            return True
        if lang == "zh" and ("熱門作品" in line or "最新上架" in line or "閱讀紀錄" in line):
            return True
        return False

    lines = [line.rstrip() for line in text.replace("\u00a0", " ").splitlines()]
    cleaned: List[str] = []
    for raw in lines:
        line = raw.strip()
        if is_noise_line(line, language):
            continue
        cleaned.append(line)

    while cleaned and is_noise_line(cleaned[0].strip(), language):
        cleaned.pop(0)
    while cleaned and is_noise_line(cleaned[-1].strip(), language):
        cleaned.pop()

    return "\n".join(cleaned).strip()


class TextUploadRequest(UploadLlmOptionsRequest):
    """텍스트 직접 붙여넣기용 요청 스키마"""
    book: str = ""
    book_ko: str = ""
    book_zh: str = ""
    ko_text: str
    zh_text: str = ""
    chapter: str = ""
    chapter_zh: str = ""
    mapping_direction: Literal["ko_to_zh", "zh_to_ko"] = "zh_to_ko"
    input_language: Literal["ko", "zh"] = "ko"
    is_original_text: bool = False
    resegment_ko_by_zh: bool = False
    script: str = "unknown"


def _run_upload_job(job_id: str, payload: dict):
    try:
        _set_job_status(JOB_TYPE_UPLOAD, job_id, status="running")
        result = asyncio.run(_process_upload(**payload))
        _set_job_status(
            JOB_TYPE_UPLOAD,
            job_id,
            status="completed",
            result=result.model_dump(),
        )
    except Exception as exc:
        _set_job_status(JOB_TYPE_UPLOAD, job_id, status="failed", error=str(exc))


@router.post("/text", response_model=UploadResult)
async def upload_translation_text(req: TextUploadRequest):
    """
    텍스트 직접 붙여넣기로 업로드 → 원문 자동 매핑 → 데이터셋 누적
    파일 대신 JSON body로 ko_text를 직접 전달.
    """
    ko_text = req.ko_text.strip()
    if not ko_text:
        raise HTTPException(status_code=400, detail="빈 텍스트")
    job_id = _queue_job(JOB_TYPE_UPLOAD)
    payload = {
        "ko_text": ko_text,
        "source_zh_text": req.zh_text,
        "book": req.book,
        "book_ko": req.book_ko,
        "book_zh": req.book_zh,
        "chapter": req.chapter,
        "chapter_zh": req.chapter_zh,
        "mapping_direction": req.mapping_direction,
        "input_language": req.input_language,
        "is_original_text": req.is_original_text,
        "resegment_ko_by_zh": req.resegment_ko_by_zh,
        "script": req.script,
        "provider": req.provider,
        "model": req.model,
    }
    worker = threading.Thread(target=_run_upload_job, args=(job_id, payload), daemon=True)
    worker.start()
    return {"id": job_id, "book": req.book_ko or req.book_zh or req.book, "chapter": 0, "zh_fetched": False, "new_terms": [], "status": "queued"}


@router.post("/", response_model=UploadResult)
async def upload_translation(
    file: UploadFile = File(...),
    book: str = Form(""),
    book_ko: str = Form(""),
    book_zh: str = Form(""),
    chapter: str = Form(""),
    chapter_zh: str = Form(""),    # 중국어 원문 화수 (비워두면 chapter와 동일)
    mapping_direction: Literal["ko_to_zh", "zh_to_ko"] = Form("zh_to_ko"),
    input_language: Literal["ko", "zh"] = Form("ko"),
    is_original_text: bool = Form(False),
    resegment_ko_by_zh: bool = Form(False),
    script: str = Form("unknown"), # simplified / traditional / unknown
    provider: str = Form(""),
    model: str = Form(""),
):
    """
    번역 텍스트 파일 업로드 → 원문 자동 매핑 → 데이터셋 누적
    """
    content = await file.read()
    ko_text = content.decode('utf-8', 'ignore').strip()

    if not ko_text:
        raise HTTPException(status_code=400, detail="빈 파일")

    job_id = _queue_job(JOB_TYPE_UPLOAD)
    payload = {
        "ko_text": ko_text,
        "book": book,
        "book_ko": book_ko,
        "book_zh": book_zh,
        "chapter": chapter,
        "chapter_zh": chapter_zh,
        "mapping_direction": mapping_direction,
        "input_language": input_language,
        "is_original_text": is_original_text,
        "resegment_ko_by_zh": resegment_ko_by_zh,
        "script": script,
        "provider": provider,
        "model": model,
    }
    worker = threading.Thread(target=_run_upload_job, args=(job_id, payload), daemon=True)
    worker.start()
    return {"id": job_id, "book": book_ko or book_zh or book, "chapter": 0, "zh_fetched": False, "new_terms": [], "status": "queued"}


@router.get("/jobs/{job_id}")
def upload_job_status(job_id: str):
    job = _get_job(JOB_TYPE_UPLOAD, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="업로드 작업을 찾을 수 없습니다.")
    return job


@router.get("/jobs")
def list_upload_jobs(limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    return {"jobs": _list_jobs(JOB_TYPE_UPLOAD, safe_limit)}


@router.get("/alignment-reviews", response_model=List[AlignmentReview])
def list_alignment_reviews(book: str | None = None, limit: int = 50):
    safe_limit = max(1, min(limit, 200))
    reviews = ALIGNMENT_REVIEW_STORE.list_reviews(status="pending", book=book or None, limit=safe_limit)
    return [_build_alignment_review(review) for review in reviews]


@router.post("/alignment-reviews/{review_id}/keep", response_model=AlignmentReview)
def keep_alignment_review(review_id: str):
    review = ALIGNMENT_REVIEW_STORE.get_review(review_id)
    if not review or review.get("status") != "pending":
        raise HTTPException(status_code=404, detail="정렬 검토 항목을 찾을 수 없습니다.")
    resolved = ALIGNMENT_REVIEW_STORE.resolve_review(review_id, status="kept")
    if not resolved:
        raise HTTPException(status_code=404, detail="정렬 검토 항목을 찾을 수 없습니다.")
    return _build_alignment_review(resolved)


@router.put("/alignment-reviews/{review_id}", response_model=AlignmentReview)
def update_alignment_review(review_id: str, req: AlignmentReviewUpdateRequest):
    review = ALIGNMENT_REVIEW_STORE.get_review(review_id)
    if not review or review.get("status") != "pending":
        raise HTTPException(status_code=404, detail="정렬 검토 항목을 찾을 수 없습니다.")

    merged = dict(review)
    if req.proposed_ko_text is not None:
        cleaned = _join_alignment_units(_split_alignment_units(req.proposed_ko_text))
        if not cleaned:
            raise HTTPException(status_code=400, detail="정렬 제안 번역은 비워둘 수 없습니다.")
        merged["proposed_ko_text"] = cleaned
    if req.start_reason is not None:
        merged["start_reason"] = str(req.start_reason)
    if req.end_reason is not None:
        merged["end_reason"] = str(req.end_reason)

    persisted = ALIGNMENT_REVIEW_STORE.upsert_review(merged)
    return _build_alignment_review(persisted)


@router.post("/alignment-reviews/{review_id}/adjust-boundary", response_model=List[AlignmentReview])
def adjust_alignment_review_boundary(review_id: str, req: AlignmentReviewBoundaryAdjustRequest):
    review = ALIGNMENT_REVIEW_STORE.get_review(review_id)
    if not review or review.get("status") != "pending":
        raise HTTPException(status_code=404, detail="정렬 검토 항목을 찾을 수 없습니다.")

    reviews = ALIGNMENT_REVIEW_STORE.list_reviews(status="pending", book=str(review.get("book", "")), limit=200)
    reviews.sort(key=lambda item: (int(item.get("chapter_ko", 0) or 0), str(item.get("chapter_zh", ""))))
    index = next((idx for idx, item in enumerate(reviews) if item.get("review_id") == review_id), -1)
    if index == -1:
        raise HTTPException(status_code=404, detail="정렬 검토 항목을 찾을 수 없습니다.")

    current = dict(reviews[index])
    previous = dict(reviews[index - 1]) if index > 0 else None
    next_review = dict(reviews[index + 1]) if index < len(reviews) - 1 else None

    current_units = _split_alignment_units(current.get("proposed_ko_text", ""))
    prev_units = _split_alignment_units(previous.get("proposed_ko_text", "")) if previous else []
    next_units = _split_alignment_units(next_review.get("proposed_ko_text", "")) if next_review else []

    moved_unit = ""
    if req.direction == "send_start_to_prev":
        if previous is None:
            raise HTTPException(status_code=409, detail="이전 화 정렬 검토 항목이 없습니다.")
        if len(current_units) < 2:
            raise HTTPException(status_code=409, detail="현재 화에서 보낼 수 있는 시작 구간이 부족합니다.")
        moved_unit = current_units.pop(0)
        prev_units.append(moved_unit)
        previous["end_reason"] = "manually extended with the next chapter opening"
        current["start_reason"] = "manually trimmed after sending the opening to the previous chapter"
    elif req.direction == "send_end_to_next":
        if next_review is None:
            raise HTTPException(status_code=409, detail="다음 화 정렬 검토 항목이 없습니다.")
        if len(current_units) < 2:
            raise HTTPException(status_code=409, detail="현재 화에서 보낼 수 있는 끝 구간이 부족합니다.")
        moved_unit = current_units.pop()
        next_units.insert(0, moved_unit)
        current["end_reason"] = "manually trimmed before the next chapter opening"
        next_review["start_reason"] = "manually extended with the previous chapter ending"
    elif req.direction == "pull_from_prev":
        if previous is None:
            raise HTTPException(status_code=409, detail="이전 화 정렬 검토 항목이 없습니다.")
        if len(prev_units) < 2:
            raise HTTPException(status_code=409, detail="이전 화에서 가져올 수 있는 끝 구간이 부족합니다.")
        moved_unit = prev_units.pop()
        current_units.insert(0, moved_unit)
        previous["end_reason"] = "manually trimmed before the current chapter"
        current["start_reason"] = "manually extended with the previous chapter ending"
    elif req.direction == "pull_from_next":
        if next_review is None:
            raise HTTPException(status_code=409, detail="다음 화 정렬 검토 항목이 없습니다.")
        if len(next_units) < 2:
            raise HTTPException(status_code=409, detail="다음 화에서 가져올 수 있는 시작 구간이 부족합니다.")
        moved_unit = next_units.pop(0)
        current_units.append(moved_unit)
        current["end_reason"] = "manually extended with the next chapter opening"
        next_review["start_reason"] = "manually trimmed after sending its opening to the current chapter"
    else:
        raise HTTPException(status_code=400, detail="지원하지 않는 정렬 조정 방향입니다.")

    current["proposed_ko_text"] = _join_alignment_units(current_units)
    updated_reviews = [ALIGNMENT_REVIEW_STORE.upsert_review(current)]

    if previous is not None and req.direction in {"send_start_to_prev", "pull_from_prev"}:
        previous["proposed_ko_text"] = _join_alignment_units(prev_units)
        updated_reviews.append(ALIGNMENT_REVIEW_STORE.upsert_review(previous))
    if next_review is not None and req.direction in {"send_end_to_next", "pull_from_next"}:
        next_review["proposed_ko_text"] = _join_alignment_units(next_units)
        updated_reviews.append(ALIGNMENT_REVIEW_STORE.upsert_review(next_review))

    return [_build_alignment_review(item) for item in updated_reviews]


@router.post("/alignment-reviews/{review_id}/apply")
def apply_alignment_review(review_id: str, req: AlignmentReviewApplyRequest | None = None):
    review = ALIGNMENT_REVIEW_STORE.get_review(review_id)
    if not review or review.get("status") != "pending":
        raise HTTPException(status_code=404, detail="정렬 검토 항목을 찾을 수 없습니다.")

    repo = get_repository()
    record_id = str(review.get("record_id", "") or "")
    record = repo.get_record(record_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"레코드 없음: {record_id}")

    override_proposed_ko = req.proposed_ko_text if req is not None else None
    proposed_ko = clean_chapter_text(
        str(override_proposed_ko if override_proposed_ko is not None else review.get("proposed_ko_text", "") or ""),
        "ko",
    )
    if not proposed_ko:
        raise HTTPException(status_code=400, detail="정렬 제안 번역이 비어 있습니다.")

    if override_proposed_ko is not None:
        review = ALIGNMENT_REVIEW_STORE.upsert_review(
            {
                **review,
                "proposed_ko_text": proposed_ko,
            }
        )

    stamp = utc_now_iso()
    resolution_note_parts = [
        f"[alignment_review_applied] applied source-based chapter resegmentation at {stamp}",
        f"confidence={float(review.get('confidence', 0) or 0):.2f}",
    ]
    if review.get("warnings"):
        resolution_note_parts.append(
            "warnings=" + ",".join(str(item) for item in review.get("warnings", []))
        )
    if review.get("start_reason"):
        resolution_note_parts.append(f"start={review.get('start_reason')}")
    if review.get("end_reason"):
        resolution_note_parts.append(f"end={review.get('end_reason')}")
    resolution_note = " | ".join(resolution_note_parts)

    record["ko_text"] = proposed_ko
    record["notes"] = (
        f"{record.get('notes', '')}\n{resolution_note}".strip()
        if record.get("notes")
        else resolution_note
    )
    if record.get("zh_text") and record.get("ko_text"):
        requested_provider = req.provider.strip() or None if req is not None else None
        requested_model = req.model.strip() or None if req is not None else None
        aligned_zh, aligned_ko = _align_parallel_segments_with_overrides(
            record.get("zh_text", ""),
            record.get("ko_text", ""),
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
        record["zh_text"] = clean_chapter_text(aligned_zh, "zh")
        record["ko_text"] = clean_chapter_text(aligned_ko, "ko")
        refreshed_terms = _extract_new_terms_with_overrides(
            record["ko_text"],
            record["zh_text"],
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
        if refreshed_terms:
            record["new_term_candidates"] = sorted(
                set(record.get("new_term_candidates", [])).union(refreshed_terms)
            )
    record["updated_at"] = stamp
    try:
        persisted = repo.update_record(record_id, record)
    except DatasetRepositoryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    ALIGNMENT_REVIEW_STORE.resolve_review(review_id, status="applied")
    return persisted


async def _process_upload(
    ko_text: str,
    chapter: str,
    source_zh_text: str = "",
    book: str = "",
    book_ko: str = "",
    book_zh: str = "",
    chapter_zh: str = "",
    mapping_direction: Literal["ko_to_zh", "zh_to_ko"] = "zh_to_ko",
    input_language: Literal["ko", "zh"] = "ko",
    is_original_text: bool = False,
    resegment_ko_by_zh: bool = False,
    script: str = "unknown",
    provider: str = "",
    model: str = "",
) -> UploadResult:
    # Original-text mode is only valid when the uploaded input itself is Chinese source.
    if input_language == "ko" and is_original_text:
        raise HTTPException(
            status_code=400,
            detail="is_original_text는 input_language=zh(중국어 입력)일 때만 사용할 수 있습니다.",
        )

    book_ko_clean = book_ko.strip()
    book_zh_clean = book_zh.strip()
    book_legacy_clean = book.strip()
    if not book_ko_clean and not book_zh_clean and not book_legacy_clean:
        raise HTTPException(status_code=400, detail="book_ko 또는 book_zh 중 하나는 입력해야 합니다.")

    book_source = resolve_supported_book(book_zh_clean, book_ko_clean, book_legacy_clean)
    if book_source:
        if not book_ko_clean:
            book_ko_clean = str(book_source.get("book_ko", "")).strip()
        if not book_zh_clean:
            book_zh_clean = str(book_source.get("book_zh", "")).strip()

    if not book_ko_clean and not book_zh_clean and book_legacy_clean:
        if re.search(r"[\u4e00-\u9fff]", book_legacy_clean):
            book_zh_clean = book_legacy_clean
        else:
            book_ko_clean = book_legacy_clean

    book_display = book_ko_clean or book_zh_clean or book_legacy_clean
    requested_provider = provider.strip() or None
    requested_model = model.strip() or None

    """파일/텍스트 공통 업로드 처리 로직 (범위 화수 분할 저장 지원)"""
    def split_ko_text_by_markers(text: str, expected_count: int) -> List[str]:
        stripped_text = text.strip()
        if not stripped_text:
            return []
        if expected_count <= 1:
            return [stripped_text]

        lines = text.splitlines()

        def marker_number(line: str) -> int | None:
            stripped = line.strip()
            patterns = (
                r"^제?\s*(\d+)\s*화(?:\b|\s*\|)",
                r"^(\d+)\s*화(?:\b|\s*\|)",
                r"^第\s*(\d+)\s*[章节回节](?:\b|\s)",
                r"^#\s*(\d+)\b",
            )
            for pattern in patterns:
                match = re.match(pattern, stripped)
                if match:
                    return int(match.group(1))
            return None

        raw_markers: List[tuple[int, int]] = []
        for idx, line in enumerate(lines):
            number = marker_number(line)
            if number is None:
                continue
            raw_markers.append((idx, number))

        if len(raw_markers) < 2:
            return [stripped_text]

        marker_indexes: List[int] = []
        previous_number: int | None = None
        previous_index: int | None = None
        for idx, number in raw_markers:
            if (
                previous_number is not None
                and number == previous_number
                and previous_index is not None
                and idx - previous_index <= 4
            ):
                continue
            marker_indexes.append(idx)
            previous_number = number
            previous_index = idx

        if len(marker_indexes) < 2:
            return [stripped_text]

        chunks: List[str] = []
        boundaries = marker_indexes + [len(lines)]
        for i in range(len(marker_indexes)):
            start = boundaries[i]
            end = boundaries[i + 1]
            chunk = "\n".join(lines[start:end]).strip()
            if chunk:
                chunks.append(chunk)

        if len(chunks) == expected_count:
            return chunks
        return [stripped_text]

    def build_book_key(raw_book: str) -> str:
        normalized = raw_book.strip().lower()
        ascii_slug = re.sub(r"[^a-z0-9]+", "", normalized)[:12]
        digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:8]
        if ascii_slug:
            return f"{ascii_slug}_{digest}"
        return f"book_{digest}"

    def ensure_record_id(raw_book: str, chapter_no: int, used_ids: set[str]) -> str:
        base = f"{build_book_key(raw_book)}_ch{chapter_no:03d}"
        if base not in used_ids:
            used_ids.add(base)
            return base
        suffix = 2
        while True:
            candidate = f"{base}_{suffix}"
            if candidate not in used_ids:
                used_ids.add(candidate)
                return candidate
            suffix += 1

    chapter_input = chapter.strip()
    chapter_zh_input = chapter_zh.strip()
    if not chapter_input and not chapter_zh_input:
        raise HTTPException(status_code=400, detail="chapter 또는 chapter_zh 중 하나는 입력해야 합니다.")

    if not chapter_input:
        chapter_input = chapter_zh_input
    if not chapter_zh_input:
        chapter_zh_input = chapter_input

    chapter_ko_values = expand_chapter_zh(chapter_input)
    if not chapter_ko_values:
        raise HTTPException(status_code=400, detail="chapter 형식 오류: 숫자/범위를 입력하세요 (예: 1, 1-3)")

    chapter_zh_values = expand_chapter_zh(chapter_zh_input)
    if not chapter_zh_values:
        raise HTTPException(status_code=400, detail="chapter_zh 형식 오류: 숫자/범위를 입력하세요 (예: 1, 1-3)")

    target_count = max(len(chapter_ko_values), len(chapter_zh_values))
    if len(chapter_ko_values) not in (1, target_count):
        raise HTTPException(status_code=400, detail="chapter 범위 길이가 chapter_zh와 맞지 않습니다.")
    if len(chapter_zh_values) not in (1, target_count):
        raise HTTPException(status_code=400, detail="chapter_zh 범위 길이가 chapter와 맞지 않습니다.")

    ko_chunks = split_ko_text_by_markers(ko_text, target_count)
    if target_count > 1:
        if len(ko_chunks) != target_count:
            raise HTTPException(
                status_code=400,
                detail=f"텍스트 화수 분할 개수({len(ko_chunks)})가 요청 화수 개수({target_count})와 다릅니다."
            )
    elif not ko_chunks:
        raise HTTPException(status_code=400, detail="빈 텍스트")

    source_zh_chunks = (
        split_ko_text_by_markers(source_zh_text.strip(), target_count)
        if source_zh_text.strip()
        else []
    )
    if target_count > 1 and source_zh_chunks and len(source_zh_chunks) != target_count:
        raise HTTPException(
            status_code=400,
            detail=f"원문 화수 분할 개수({len(source_zh_chunks)})가 요청 화수 개수({target_count})와 다릅니다.",
        )

    repo = get_repository()
    search_titles = [
        title.strip()
        for title in (book_display, book_ko_clean, book_zh_clean)
        if title and title.strip()
    ]
    records: List[dict] = []
    seen_record_ids: set[str] = set()
    for candidate in dict.fromkeys(search_titles):
        for record in load_dataset(book=candidate):
            record_id = str(record.get("id", "")).strip()
            if record_id and record_id not in seen_record_ids:
                records.append(record)
                seen_record_ids.add(record_id)
    existing_ids = {r["id"] for r in records}
    used_ids = set(existing_ids)
    record_index_by_id = {record["id"]: index for index, record in enumerate(records)}
    existing_by_pair: dict[str, dict] = {}
    for record in records:
        normalized_book = normalize_book_key(
            record.get("book_zh", ""),
            record.get("book_ko", ""),
            record.get("book", ""),
        )
        chapter_zh_raw = str(record.get("chapter_zh", "")).strip()
        chapter_zh_numbers = [int(n) for n in re.findall(r"\d+", chapter_zh_raw)]
        if not normalized_book or not chapter_zh_numbers:
            continue
        key = build_canonical_pair_key(normalized_book, chapter_zh_numbers[0])
        if key not in existing_by_pair:
            existing_by_pair[key] = record

    if input_language == "ko" and target_count > 1 and len(ko_chunks) == target_count:
        # Chinese chapter boundary 기준으로 KO chunk 넘침을 인접 회차로 재배치
        rebalanced = [clean_chapter_text(chunk, "ko") for chunk in ko_chunks]
        zh_refs: List[str] = []
        normalized_book = normalize_book_key(book_zh_clean, book_ko_clean, book_display)
        for i in range(target_count):
            current_zh = chapter_zh_values[i] if len(chapter_zh_values) > 1 else chapter_zh_values[0]
            pair_key = build_canonical_pair_key(normalized_book, current_zh)
            base_zh = ""
            existing = existing_by_pair.get(pair_key)
            if existing:
                base_zh = clean_chapter_text(existing.get("zh_text", ""), "zh")
            zh_refs.append(base_zh)

        for i in range(target_count):
            zh_ref = zh_refs[i]
            if not zh_ref:
                continue
            prev_ko, current_ko, next_ko = _split_ko_with_overrides(
                zh_ref,
                rebalanced[i],
                requested_provider=requested_provider,
                requested_model=requested_model,
            )
            if prev_ko and i > 0:
                rebalanced[i - 1] = clean_chapter_text(f"{rebalanced[i - 1]}\n{prev_ko}", "ko")
            rebalanced[i] = clean_chapter_text(current_ko, "ko") if current_ko else rebalanced[i]
            if next_ko and i < target_count - 1:
                rebalanced[i + 1] = clean_chapter_text(f"{next_ko}\n{rebalanced[i + 1]}", "ko")
        ko_chunks = rebalanced

    def ko_at(i: int) -> int:
        return chapter_ko_values[i] if len(chapter_ko_values) > 1 else chapter_ko_values[0]

    def zh_at(i: int) -> int:
        if len(chapter_zh_values) > 1:
            return chapter_zh_values[i]
        return chapter_zh_values[0]

    created_ids: List[str] = []
    created_chapters: List[int] = []
    aggregated_new_terms: set[str] = set()
    zh_fetch_flags: List[bool] = []
    source_fetch_modes: set[str] = set()
    book_meta = book_source or {}
    upserted_count = 0
    merged_count = 0
    conflicts: List[UploadConflict] = []
    alignment_applied_count = 0
    alignment_reviews: List[AlignmentReview] = []

    for index in range(target_count):
        chapter_ko = ko_at(index)
        chapter_zh_value = zh_at(index)
        chapter_text = ko_chunks[index] if target_count > 1 else ko_chunks[0]
        chapter_text = clean_chapter_text(chapter_text, input_language)
        normalized_book = normalize_book_key(book_zh_clean, book_ko_clean, book_display)
        pair_key = build_canonical_pair_key(normalized_book, chapter_zh_value)
        existing_record = existing_by_pair.get(pair_key)
        record_id = existing_record["id"] if existing_record else ensure_record_id(book_display, chapter_ko, used_ids)

        source_lookup_chapter = chapter_ko if mapping_direction == "ko_to_zh" else chapter_zh_value
        fetched_zh_text = ""
        zh_fetched = False
        source_url = ""
        chapter_source_fetch_mode = "not_configured"
        if book_source:
            src = book_source
            source_url = src["chapter_url_fn"](source_lookup_chapter)
            parser_mode = src.get("parser", "none")
            if parser_mode == "shuzhaige" and source_url:
                fetched_zh_text = fetch_zh_shuzhaige(source_url)
                fetched_zh_text = clean_chapter_text(fetched_zh_text, "zh")
                zh_fetched = bool(fetched_zh_text)
                chapter_source_fetch_mode = "full_text" if zh_fetched else "failed"
            elif parser_mode == "shuqi_meta_only":
                chapter_source_fetch_mode = "metadata_only"
        source_fetch_modes.add(chapter_source_fetch_mode)
        provided_zh_text = ""
        if source_zh_chunks:
            provided_zh_text = source_zh_chunks[index] if target_count > 1 else source_zh_chunks[0]
            provided_zh_text = clean_chapter_text(provided_zh_text, "zh")

        if input_language == "zh" and is_original_text:
            zh_text = chapter_text
            ko_text = ""
            zh_fetched = True
        else:
            zh_text = provided_zh_text or fetched_zh_text
            if provided_zh_text:
                zh_fetched = True
                chapter_source_fetch_mode = "full_text"
                source_fetch_modes.add(chapter_source_fetch_mode)
            ko_text = chapter_text

        new_terms = (
            _extract_new_terms_with_overrides(
                ko_text,
                zh_text,
                requested_provider=requested_provider,
                requested_model=requested_model,
            )
            if zh_text
            else []
        )
        detected_script = script if script != "unknown" else detect_script(zh_text or chapter_text[:200])
        now = datetime.now(timezone.utc).isoformat()

        if existing_record:
            upserted_count += 1
            existing_record["book"] = book_display
            existing_record["chapter"] = chapter_ko
            existing_record["chapter_ko"] = chapter_ko
            existing_record["chapter_zh"] = str(chapter_zh_value)
            if not existing_record.get("book_ko") and book_ko_clean:
                existing_record["book_ko"] = book_ko_clean
            if not existing_record.get("book_zh") and book_zh_clean:
                existing_record["book_zh"] = book_zh_clean
            if not existing_record.get("source_lang"):
                existing_record["source_lang"] = "zh-CN"
            if not existing_record.get("target_lang"):
                existing_record["target_lang"] = "ko-KR"
            if not existing_record.get("source_url") and source_url:
                existing_record["source_url"] = source_url
            if not existing_record.get("genre") and book_meta.get("genre"):
                existing_record["genre"] = book_meta.get("genre", [])

            existing_zh = (existing_record.get("zh_text") or "").strip()
            incoming_zh = (zh_text or "").strip()
            if not existing_zh and incoming_zh:
                existing_record["zh_text"] = zh_text
                merged_count += 1
            elif existing_zh and incoming_zh and existing_zh != incoming_zh:
                existing_record["notes"] = append_merge_conflict_note(
                    existing_record.get("notes", ""),
                    "zh_text",
                    incoming_zh,
                )
                conflicts.append(
                    UploadConflict(
                        record_id=str(existing_record.get("id", record_id)),
                        book=str(existing_record.get("book", book_display)),
                        chapter_ko=int(existing_record.get("chapter_ko", chapter_ko) or chapter_ko),
                        chapter_zh=str(existing_record.get("chapter_zh", chapter_zh_value)),
                        field="zh_text",
                        existing_value=existing_zh,
                        incoming_value=incoming_zh,
                    )
                )

            existing_ko = (existing_record.get("ko_text") or "").strip()
            incoming_ko = (ko_text or "").strip()
            if not existing_ko and incoming_ko:
                existing_record["ko_text"] = ko_text
                merged_count += 1
            elif existing_ko and incoming_ko and existing_ko != incoming_ko:
                existing_record["notes"] = append_merge_conflict_note(
                    existing_record.get("notes", ""),
                    "ko_text",
                    incoming_ko,
                )
                conflicts.append(
                    UploadConflict(
                        record_id=str(existing_record.get("id", record_id)),
                        book=str(existing_record.get("book", book_display)),
                        chapter_ko=int(existing_record.get("chapter_ko", chapter_ko) or chapter_ko),
                        chapter_zh=str(existing_record.get("chapter_zh", chapter_zh_value)),
                        field="ko_text",
                        existing_value=existing_ko,
                        incoming_value=incoming_ko,
                    )
                )

            existing_candidates = set(existing_record.get("new_term_candidates", []))
            if new_terms:
                existing_record["new_term_candidates"] = sorted(existing_candidates.union(new_terms))
            if existing_record.get("zh_text") and existing_record.get("ko_text"):
                aligned_zh, aligned_ko = _align_parallel_segments_with_overrides(
                    existing_record.get("zh_text", ""),
                    existing_record.get("ko_text", ""),
                    requested_provider=requested_provider,
                    requested_model=requested_model,
                )
                existing_record["zh_text"] = clean_chapter_text(aligned_zh, "zh")
                existing_record["ko_text"] = clean_chapter_text(aligned_ko, "ko")
                refreshed_terms = _extract_new_terms_with_overrides(
                    existing_record["ko_text"],
                    existing_record["zh_text"],
                    requested_provider=requested_provider,
                    requested_model=requested_model,
                )
                if refreshed_terms:
                    existing_record["new_term_candidates"] = sorted(
                        set(existing_record.get("new_term_candidates", [])).union(refreshed_terms)
                    )
            existing_record["updated_at"] = now
            if existing_record.get("script") in ("", "unknown", None):
                existing_record["script"] = detected_script
            try:
                persisted = _persist_updated_record(
                    repo,
                    records,
                    record_index_by_id,
                    record_id,
                    existing_record,
                )
            except DatasetRepositoryError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            existing_by_pair[pair_key] = persisted
            records[record_index_by_id[record_id]] = persisted
            created_ids.append(record_id)
            created_chapters.append(int(persisted.get("chapter_ko", chapter_ko)))
        else:
            record = {
                "id": record_id,
                "book": book_display,
                "book_ko": book_ko_clean,
                "book_zh": book_zh_clean,
                "chapter": chapter_ko,
                "chapter_ko": chapter_ko,
                "chapter_zh": str(chapter_zh_value),
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
                "notes": f"업로드: {now} | input_language={input_language} | is_original_text={is_original_text}",
                "updated_at": now,
            }
            if record["zh_text"] and record["ko_text"]:
                aligned_zh, aligned_ko = _align_parallel_segments_with_overrides(
                    record["zh_text"],
                    record["ko_text"],
                    requested_provider=requested_provider,
                    requested_model=requested_model,
                )
                record["zh_text"] = clean_chapter_text(aligned_zh, "zh")
                record["ko_text"] = clean_chapter_text(aligned_ko, "ko")
                aligned_terms = _extract_new_terms_with_overrides(
                    record["ko_text"],
                    record["zh_text"],
                    requested_provider=requested_provider,
                    requested_model=requested_model,
                )
                if aligned_terms:
                    record["new_term_candidates"] = aligned_terms
            try:
                persisted = _persist_created_record(repo, records, record)
            except DatasetRepositoryError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            if record_id not in record_index_by_id:
                if get_dataset_backend() != "file":
                    records.append(persisted)
                record_index_by_id[record_id] = len(records) - 1
            existing_by_pair[pair_key] = persisted
            created_ids.append(record_id)
            created_chapters.append(int(persisted.get("chapter_ko", chapter_ko)))
        aggregated_new_terms.update(new_terms)
        zh_fetch_flags.append(zh_fetched)

    if resegment_ko_by_zh and input_language == "zh":
        normalized_book = normalize_book_key(book_zh_clean, book_ko_clean, book_display)
        target_zh_set = set(chapter_zh_values)
        candidates: List[dict] = []
        for record in records:
            record_book = normalize_book_key(
                record.get("book_zh", ""),
                record.get("book_ko", ""),
                record.get("book", ""),
            )
            if record_book != normalized_book:
                continue
            chapter_zh_raw = str(record.get("chapter_zh", "")).strip()
            nums = [int(n) for n in re.findall(r"\d+", chapter_zh_raw)]
            if not nums or nums[0] not in target_zh_set:
                continue
            candidates.append(record)

        alignment_batch_id = uuid.uuid4().hex
        alignment_batch_label = _format_alignment_batch_label(sorted(target_zh_set))
        raw_ko_pool = build_ko_pool(candidates, clean_chapter_text)
        decisions = align_ko_chapters_by_zh(
            candidates,
            cleaner=clean_chapter_text,
            splitter=lambda zh_text, ko_text: _split_ko_with_overrides(
                zh_text,
                ko_text,
                requested_provider=requested_provider,
                requested_model=requested_model,
            ),
            aligner=lambda zh_text, ko_text: _align_parallel_segments_with_overrides(
                zh_text,
                ko_text,
                requested_provider=requested_provider,
                requested_model=requested_model,
            ),
            confidence_threshold=ALIGNMENT_CONFIDENCE_THRESHOLD,
        )
        pending_review_count = sum(1 for decision in decisions if not decision.auto_applied)
        ALIGNMENT_BATCH_STORE.upsert_batch(
            {
                "batch_id": alignment_batch_id,
                "book": book_display,
                "chapter_range": alignment_batch_label,
                "chapter_zh_values": sorted(target_zh_set),
                "record_ids": [str(record.get("id", "") or "") for record in candidates],
                "ko_pool_text": raw_ko_pool,
                "confidence_threshold": ALIGNMENT_CONFIDENCE_THRESHOLD,
                "total_reviews": len(decisions),
                "pending_reviews": pending_review_count,
                "auto_applied_reviews": len(decisions) - pending_review_count,
                "status": "pending_review" if pending_review_count > 0 else "auto_applied",
                "notes": f"resegment_ko_by_zh upload | book={book_display} | chapters={alignment_batch_label}",
            }
        )

        for batch_index, decision in enumerate(decisions, start=1):
            record = next((item for item in candidates if str(item.get("id", "")) == decision.record_id), None)
            if record is None:
                continue
            review_id = make_alignment_review_id(decision.record_id, decision.chapter_zh)
            review_payload = {
                "review_id": review_id,
                "record_id": decision.record_id,
                "book": decision.book,
                "chapter_ko": decision.chapter_ko,
                "chapter_zh": decision.chapter_zh,
                "existing_ko_text": decision.existing_ko_text,
                "proposed_ko_text": decision.proposed_ko_text,
                "batch_id": alignment_batch_id,
                "batch_label": alignment_batch_label,
                "batch_index": batch_index,
                "batch_total": len(decisions),
                "confidence": decision.confidence,
                "warnings": decision.warnings,
                "start_reason": decision.start_reason,
                "end_reason": decision.end_reason,
            }

            if not decision.auto_applied:
                persisted_review = ALIGNMENT_REVIEW_STORE.upsert_review(
                    {
                        **review_payload,
                        "status": "pending",
                    }
                )
                alignment_reviews.append(_build_alignment_review(persisted_review))
                continue

            if not decision.proposed_ko_text or decision.proposed_ko_text == decision.existing_ko_text:
                ALIGNMENT_REVIEW_STORE.resolve_review(review_id, status="auto_skipped")
                continue

            record["ko_text"] = clean_chapter_text(decision.proposed_ko_text, "ko")
            if record.get("zh_text") and record.get("ko_text"):
                aligned_zh, aligned_ko = _align_parallel_segments_with_overrides(
                    record.get("zh_text", ""),
                    record.get("ko_text", ""),
                    requested_provider=requested_provider,
                    requested_model=requested_model,
                )
                record["zh_text"] = clean_chapter_text(aligned_zh, "zh")
                record["ko_text"] = clean_chapter_text(aligned_ko, "ko")
                refreshed_terms = _extract_new_terms_with_overrides(
                    record["ko_text"],
                    record["zh_text"],
                    requested_provider=requested_provider,
                    requested_model=requested_model,
                )
                if refreshed_terms:
                    record["new_term_candidates"] = sorted(
                        set(record.get("new_term_candidates", [])).union(refreshed_terms)
                    )
            record["updated_at"] = utc_now_iso()
            try:
                persisted = _persist_updated_record(
                    repo,
                    records,
                    record_index_by_id,
                    str(record["id"]),
                    record,
                )
            except DatasetRepositoryError as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
            records[record_index_by_id[str(record["id"])]] = persisted
            ALIGNMENT_REVIEW_STORE.resolve_review(review_id, status="auto_applied")
            alignment_applied_count += 1

    zh_fetched_any = any(zh_fetch_flags)
    zh_fetched_all = bool(zh_fetch_flags) and all(zh_fetch_flags)
    if len(source_fetch_modes) == 1:
        source_fetch_mode = next(iter(source_fetch_modes))
    elif not source_fetch_modes:
        source_fetch_mode = "not_configured"
    elif source_fetch_modes == {"metadata_only", "not_configured"}:
        source_fetch_mode = "metadata_only"
    elif "full_text" in source_fetch_modes:
        source_fetch_mode = "full_text"
    elif "failed" in source_fetch_modes:
        source_fetch_mode = "failed"
    else:
        source_fetch_mode = "not_configured"

    if conflicts:
        final_status = "conflict_pending"
    elif alignment_reviews:
        final_status = "alignment_review_needed"
    else:
        final_status = "added_multi" if len(created_ids) > 1 else "added"

    return UploadResult(
        id=created_ids[0],
        book=book_display,
        chapter=created_chapters[0] if created_chapters else 0,
        zh_fetched=zh_fetched_any,
        new_terms=sorted(aggregated_new_terms)[:30],
        status=final_status,
        created_count=len(created_ids),
        created_chapters=created_chapters,
        zh_fetched_any=zh_fetched_any,
        zh_fetched_all=zh_fetched_all,
        source_fetch_mode=source_fetch_mode,
        upserted_count=upserted_count,
        merged_count=merged_count,
        conflict_count=len(conflicts),
        conflicts=conflicts,
        alignment_applied_count=alignment_applied_count,
        alignment_review_count=len(alignment_reviews),
        alignment_reviews=alignment_reviews,
    )


class PromoteCandidatesRequest(BaseModel):
    book: str = ""
    chapter_ko: Optional[int] = None


@router.post("/promote-candidates")
def promote_candidates(req: PromoteCandidatesRequest):
    """dataset new_term_candidates를 glossary.json으로 승격."""
    selected = load_dataset(book=req.book or None, chapter_ko=req.chapter_ko)

    glossary = load_glossary()
    glossary, refreshed_meanings = backfill_glossary_term_meanings(glossary, selected)
    existing_terms = {t.get("term_zh", "") for t in glossary}

    added = 0
    added_meanings = 0
    pending_terms: list[dict] = []
    for record in selected:
        for term_zh in record.get("new_term_candidates", []):
            if not term_zh or term_zh in existing_terms:
                continue
            pending_terms.append({
                "term_zh": term_zh,
                "term_ko": "",
                "term_meaning_ko": "",
                "pos": "미분류",
                "domain": record.get("book", ""),
                "policy": "검토중",
                "notes": "업로드 후보 자동 승격",
                "book": record.get("book", ""),
                "added_at": datetime.now(timezone.utc).isoformat(),
                "source_chapter": record.get("chapter_ko"),
            })
            existing_terms.add(term_zh)
            added += 1

    changed = refreshed_meanings > 0
    if pending_terms:
        enriched_terms, added_meanings = backfill_glossary_term_meanings(pending_terms, selected)
        glossary.extend(enriched_terms)
        changed = True
    if changed:
        save_glossary(glossary)
    return {
        "added": added,
        "meaning_updated": refreshed_meanings + added_meanings,
    }


class ExtractCandidatesRequest(UploadLlmOptionsRequest):
    record_id: str = ""
    record_ids: List[str] = []
    book: str = ""
    chapter_ko: Optional[int] = None


def _extract_candidates_sync(req: ExtractCandidatesRequest) -> dict:
    repo = get_repository()
    records = load_dataset()
    record_index_by_id = {record["id"]: index for index, record in enumerate(records)}
    targets = records
    if req.record_ids:
        id_set = set(req.record_ids)
        targets = [r for r in targets if r.get("id") in id_set]
    if req.record_id:
        targets = [r for r in targets if r.get("id") == req.record_id]
    if req.book:
        targets = [r for r in targets if r.get("book") == req.book]
    if req.chapter_ko is not None:
        targets = [r for r in targets if r.get("chapter_ko") == req.chapter_ko]
    if not targets:
        raise HTTPException(status_code=404, detail="대상 레코드를 찾을 수 없습니다.")

    updated = 0
    total_candidates = 0
    requested_provider = req.provider.strip() or None
    requested_model = req.model.strip() or None
    target_ids = {r.get("id") for r in targets}
    for idx, record in enumerate(records):
        if record.get("id") not in target_ids:
            continue
        zh_text = clean_chapter_text(record.get("zh_text", ""), "zh")
        ko_text = clean_chapter_text(record.get("ko_text", ""), "ko")
        if zh_text and ko_text:
            zh_text, ko_text = _align_parallel_segments_with_overrides(
                zh_text,
                ko_text,
                requested_provider=requested_provider,
                requested_model=requested_model,
            )
            records[idx]["zh_text"] = clean_chapter_text(zh_text, "zh")
            records[idx]["ko_text"] = clean_chapter_text(ko_text, "ko")
        new_terms = _extract_new_terms_with_overrides(
            ko_text,
            zh_text,
            requested_provider=requested_provider,
            requested_model=requested_model,
        )
        records[idx]["new_term_candidates"] = new_terms
        records[idx]["updated_at"] = utc_now_iso()
        try:
            _persist_updated_record(
                repo,
                records,
                record_index_by_id,
                records[idx]["id"],
                records[idx],
            )
        except DatasetRepositoryError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        updated += 1
        total_candidates += len(new_terms)
    return {"updated_records": updated, "total_candidates": total_candidates}


def _run_extract_job(job_id: str, req: ExtractCandidatesRequest):
    try:
        _set_job_status(JOB_TYPE_EXTRACT, job_id, status="running")
        result = _extract_candidates_sync(req)
        _set_job_status(JOB_TYPE_EXTRACT, job_id, status="completed", result=result)
    except Exception as exc:
        _set_job_status(JOB_TYPE_EXTRACT, job_id, status="failed", error=str(exc))


@router.post("/extract-candidates")
def extract_candidates(req: ExtractCandidatesRequest):
    """기존 dataset 레코드에서 용어 후보 재추출 (백그라운드 배치)."""
    job_id = _queue_job(JOB_TYPE_EXTRACT)
    worker = threading.Thread(target=_run_extract_job, args=(job_id, req), daemon=True)
    worker.start()
    return {"job_id": job_id, "status": "queued"}


@router.get("/extract-candidates/{job_id}")
def extract_candidates_job_status(job_id: str):
    job = _get_job(JOB_TYPE_EXTRACT, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")
    return job


@router.get("/books")
def list_supported_books():
    """원문 자동 매핑 지원 작품 목록"""
    return [
        {
            "book": meta["book_ko"] or meta["book_zh"],
            "book_ko": meta["book_ko"],
            "book_zh": meta["book_zh"],
            "aliases": list(meta.get("aliases", [])),
            "parser": meta["parser"],
            "genre": meta["genre"],
            "era_profile": meta["era_profile"],
        }
        for meta in BOOK_SOURCE_CATALOG
    ]
