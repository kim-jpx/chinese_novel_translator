"""Glossary router - 용어사전 CRUD."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.storage.dataset_repository import (
    DatasetBackendUnavailableError,
    get_dataset_repository,
)
from backend.storage.glossary_store import load_glossary, normalize_glossary_term, save_glossary
from backend.storage.translation_memory import build_term_examples

router = APIRouter()


class Term(BaseModel):
    term_zh: str
    term_ko: str
    term_meaning_ko: str = ""
    pos: str
    domain: str = ""
    policy: str
    notes: str = ""
    book: str = ""
    added_at: Optional[str] = None
    source_chapter: Optional[int] = None


class TermExample(BaseModel):
    record_id: str
    book: str
    chapter_ko: int
    chapter_zh: str
    matched_in: str
    zh_snippet: str
    ko_snippet: str


@router.get("", response_model=list[Term])
def get_glossary(book: Optional[str] = None, domain: Optional[str] = None):
    terms = load_glossary()
    if book:
        terms = [
            term
            for term in terms
            if term.get("book") == book or term.get("domain") == book
        ]
    if domain:
        terms = [term for term in terms if term.get("domain") == domain]
    return terms


@router.post("", response_model=Term)
def add_term(term: Term):
    terms = load_glossary()
    if any(existing["term_zh"] == term.term_zh and (existing.get("book") or "") == (term.book or term.domain or "") for existing in terms):
        raise HTTPException(status_code=409, detail=f"이미 존재하는 용어: {term.term_zh}")

    data = normalize_glossary_term(term.model_dump())
    data["added_at"] = datetime.now(timezone.utc).isoformat()
    save_glossary(terms + [data])
    return data


@router.get("/examples", response_model=list[TermExample])
def get_term_examples(term_zh: str, book: Optional[str] = None, limit: int = 6):
    term_zh_clean = term_zh.strip()
    if not term_zh_clean:
        raise HTTPException(status_code=400, detail="term_zh is required")

    glossary = load_glossary()
    matching_terms = [
        term
        for term in glossary
        if term.get("term_zh", "") == term_zh_clean
        and (not book or term.get("book") == book or term.get("domain") == book or not (term.get("book") or term.get("domain")))
    ]
    preferred_term = next(
        (term for term in matching_terms if book and (term.get("book") == book or term.get("domain") == book)),
        matching_terms[0]
        if matching_terms
        else {"term_zh": term_zh_clean, "term_ko": "", "term_meaning_ko": "", "book": book or ""},
    )

    try:
        repo = get_dataset_repository()
        if book:
            records = repo.list_records(book_exact=book)
        else:
            records = repo.list_records()
    except DatasetBackendUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    examples = build_term_examples(
        records,
        term_zh=term_zh_clean,
        term_ko=str(preferred_term.get("term_ko", "") or "").strip(),
        limit=max(1, min(limit, 12)),
    )
    return examples


@router.put("/{term_zh}", response_model=Term)
def update_term(term_zh: str, term: Term):
    terms = load_glossary()
    updated = normalize_glossary_term(term.model_dump())
    for index, existing in enumerate(terms):
        if existing["term_zh"] == term_zh and (existing.get("book") or existing.get("domain") or "") == (updated.get("book") or updated.get("domain") or ""):
            terms[index] = updated
            save_glossary(terms)
            return updated

    for index, existing in enumerate(terms):
        if existing["term_zh"] == term_zh:
            terms[index] = updated
            save_glossary(terms)
            return updated

    raise HTTPException(status_code=404, detail=f"용어 없음: {term_zh}")


@router.delete("/{term_zh}")
def delete_term(term_zh: str):
    terms = load_glossary()
    filtered = [term for term in terms if term["term_zh"] != term_zh]
    if len(filtered) == len(terms):
        raise HTTPException(status_code=404, detail=f"용어 없음: {term_zh}")
    save_glossary(filtered)
    return {"deleted": term_zh}


@router.get("/books")
def get_books():
    terms = load_glossary()
    books = {term.get("book") or term.get("domain") for term in terms if term.get("book") or term.get("domain")}
    return sorted(books)
