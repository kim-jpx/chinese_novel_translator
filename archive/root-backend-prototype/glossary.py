"""
Glossary router - 용어사전 CRUD
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
import os
from pathlib import Path
from datetime import datetime, timezone

router = APIRouter()


def get_glossary_path() -> Path:
    return Path(os.getenv("GLOSSARY_PATH", "../../glossary.json"))


class Term(BaseModel):
    term_zh: str
    term_ko: str
    pos: str
    domain: str
    policy: str  # 고정 / 조건부 / 검토중
    notes: str = ""
    book: str = ""
    added_at: Optional[str] = None
    source_chapter: Optional[int] = None


def load_glossary() -> List[dict]:
    path = get_glossary_path()
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def save_glossary(terms: List[dict]):
    get_glossary_path().write_text(
        json.dumps(terms, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


@router.get("/", response_model=List[Term])
def get_glossary(book: Optional[str] = None, domain: Optional[str] = None):
    """전체 용어사전 조회. book/domain 필터 가능."""
    terms = load_glossary()
    if book:
        terms = [t for t in terms if t.get("book") == book or t.get("domain") == book]
    if domain:
        terms = [t for t in terms if t.get("domain") == domain]
    return terms


@router.post("/", response_model=Term)
def add_term(term: Term):
    """새 용어 추가."""
    terms = load_glossary()
    # 중복 확인
    if any(t["term_zh"] == term.term_zh for t in terms):
        raise HTTPException(status_code=409, detail=f"이미 존재하는 용어: {term.term_zh}")
    data = term.model_dump()
    data["added_at"] = datetime.now(timezone.utc).isoformat()
    terms.append(data)
    save_glossary(terms)
    return data


@router.put("/{term_zh}", response_model=Term)
def update_term(term_zh: str, term: Term):
    """용어 수정."""
    terms = load_glossary()
    for i, t in enumerate(terms):
        if t["term_zh"] == term_zh:
            terms[i] = term.model_dump()
            save_glossary(terms)
            return terms[i]
    raise HTTPException(status_code=404, detail=f"용어 없음: {term_zh}")


@router.delete("/{term_zh}")
def delete_term(term_zh: str):
    """용어 삭제."""
    terms = load_glossary()
    original_len = len(terms)
    terms = [t for t in terms if t["term_zh"] != term_zh]
    if len(terms) == original_len:
        raise HTTPException(status_code=404, detail=f"용어 없음: {term_zh}")
    save_glossary(terms)
    return {"deleted": term_zh}


@router.get("/books")
def get_books():
    """작품 목록 조회."""
    terms = load_glossary()
    books = list(set(t.get("domain", "") for t in terms if t.get("domain")))
    return sorted(books)
