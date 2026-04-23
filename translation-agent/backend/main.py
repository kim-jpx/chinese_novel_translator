"""Translation Agent Backend."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import dataset, glossary, translate, upload
from backend.storage.config import (
    get_cors_origins,
    get_dataset_backend,
    get_glossary_path,
    is_supabase_configured,
)
from backend.storage.dataset_repository import (
    DatasetBackendUnavailableError,
    get_dataset_repository,
)
from backend.storage.glossary_store import count_glossary_terms

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

app = FastAPI(
    title="Translation Agent API",
    description="중한 문학 번역 에이전트 - 무협/선협/고장극/언정",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(glossary.router, prefix="/api/glossary", tags=["glossary"])
app.include_router(dataset.router, prefix="/api/dataset", tags=["dataset"])
app.include_router(translate.router, prefix="/api/translate", tags=["translate"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])


@app.get("/")
def root():
    return {"status": "ok", "message": "Translation Agent API running"}


@app.get("/api/health")
def health():
    dataset_backend = get_dataset_backend()
    supabase_configured = is_supabase_configured()
    supabase_connected = False
    if dataset_backend == "supabase" and supabase_configured:
        try:
            supabase_connected = get_dataset_repository().ping()
        except DatasetBackendUnavailableError:
            supabase_connected = False

    glossary_path = get_glossary_path()
    return {
        "api_key_set": bool(os.getenv("ANTHROPIC_API_KEY")),
        "supabase_configured": supabase_configured,
        "supabase_connected": supabase_connected,
        "dataset_backend": dataset_backend,
        "glossary_exists": glossary_path.exists(),
        "glossary_terms": count_glossary_terms(),
    }
