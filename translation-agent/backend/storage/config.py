"""Backend configuration and path helpers."""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
TRANSLATION_AGENT_DIR = BACKEND_DIR.parent
PROJECT_ROOT = TRANSLATION_AGENT_DIR.parent

DEFAULT_DATASET_BACKEND = "supabase"
DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:3003",
)


def _resolve_backend_relative(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return (BACKEND_DIR / path).resolve()


def get_dataset_path() -> Path:
    return _resolve_backend_relative(
        os.getenv("DATASET_PATH", "../data/dataset_multinovel.jsonl")
    )


def get_glossary_path() -> Path:
    return _resolve_backend_relative(os.getenv("GLOSSARY_PATH", "../data/glossary.json"))


def get_style_guide_path() -> Path:
    return _resolve_backend_relative(
        os.getenv("STYLE_GUIDE_PATH", "../data/style_guide_v1.md")
    )


def get_job_store_path() -> Path:
    return _resolve_backend_relative(os.getenv("JOB_STORE_PATH", "../data/jobs.sqlite3"))


def get_draft_history_store_path() -> Path:
    return _resolve_backend_relative(
        os.getenv("DRAFT_HISTORY_STORE_PATH", "../data/draft_history.sqlite3")
    )


def get_root_glossary_path() -> Path:
    return PROJECT_ROOT / "glossary.json"


def get_dataset_backend() -> str:
    return (os.getenv("DATASET_BACKEND", DEFAULT_DATASET_BACKEND) or DEFAULT_DATASET_BACKEND).strip().lower()


def get_supabase_url() -> str:
    return (os.getenv("SUPABASE_URL", "") or "").strip().rstrip("/")


def get_supabase_service_role_key() -> str:
    return (os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or "").strip()


def is_supabase_configured() -> bool:
    return bool(get_supabase_url() and get_supabase_service_role_key())


def get_cors_origins() -> list[str]:
    raw = (os.getenv("BACKEND_CORS_ORIGINS", "") or "").strip()
    if not raw:
        return list(DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]
