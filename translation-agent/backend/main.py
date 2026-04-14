"""
Translation Agent Backend
FastAPI server for the Chinese-Korean literary translation agent.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import os
from pathlib import Path
from dotenv import load_dotenv

from routers import glossary, dataset, translate, upload

load_dotenv()

app = FastAPI(
    title="Translation Agent API",
    description="중한 문학 번역 에이전트 - 무협/선협/고장극/언정",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://192.168.64.2:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    api_key = os.getenv("ANTHROPIC_API_KEY")
    return {
        "api_key_set": bool(api_key),
        "dataset_exists": Path(os.getenv("DATASET_PATH", "../dataset_multinovel.jsonl")).exists(),
        "glossary_exists": Path(os.getenv("GLOSSARY_PATH", "../glossary.json")).exists(),
    }
