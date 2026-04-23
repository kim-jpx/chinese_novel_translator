"""SQLite-backed persistence for raw KO alignment batches."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteAlignmentBatchStore:
    """Persist raw KO pools and batch metadata for future re-alignment."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=30000")
        return connection

    @contextmanager
    def _connection(self):
        connection = self._connect()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _init_db(self) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                create table if not exists alignment_batches (
                  batch_id text primary key,
                  book text not null,
                  chapter_range text not null default '',
                  chapter_zh_values_json text not null default '[]',
                  record_ids_json text not null default '[]',
                  ko_pool_text text not null default '',
                  confidence_threshold real not null default 0,
                  total_reviews integer not null default 0,
                  pending_reviews integer not null default 0,
                  auto_applied_reviews integer not null default 0,
                  status text not null default 'pending_review',
                  notes text not null default '',
                  created_at text not null,
                  updated_at text not null
                )
                """
            )
            connection.execute(
                """
                create index if not exists alignment_batches_status_created_idx
                on alignment_batches (status, created_at desc)
                """
            )
            connection.execute(
                """
                create index if not exists alignment_batches_book_created_idx
                on alignment_batches (book, created_at desc)
                """
            )

    def _serialize(self, payload: list[Any]) -> str:
        return json.dumps(payload, ensure_ascii=False)

    def _deserialize(self, raw: str | None) -> list[Any]:
        if not raw:
            return []
        return list(json.loads(raw))

    def _row_to_batch(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "batch_id": row["batch_id"],
            "book": row["book"],
            "chapter_range": row["chapter_range"],
            "chapter_zh_values": self._deserialize(row["chapter_zh_values_json"]),
            "record_ids": self._deserialize(row["record_ids_json"]),
            "ko_pool_text": row["ko_pool_text"],
            "confidence_threshold": float(row["confidence_threshold"] or 0),
            "total_reviews": int(row["total_reviews"] or 0),
            "pending_reviews": int(row["pending_reviews"] or 0),
            "auto_applied_reviews": int(row["auto_applied_reviews"] or 0),
            "status": row["status"],
            "notes": row["notes"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def upsert_batch(self, batch: dict[str, Any]) -> dict[str, Any]:
        batch_id = str(batch.get("batch_id", "") or "").strip()
        if not batch_id:
            raise ValueError("batch_id is required")
        now = utc_now_iso()
        with self._connection() as connection:
            existing = connection.execute(
                "select created_at from alignment_batches where batch_id = ? limit 1",
                (batch_id,),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            connection.execute(
                """
                insert into alignment_batches (
                  batch_id, book, chapter_range, chapter_zh_values_json, record_ids_json,
                  ko_pool_text, confidence_threshold, total_reviews, pending_reviews,
                  auto_applied_reviews, status, notes, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(batch_id) do update set
                  book = excluded.book,
                  chapter_range = excluded.chapter_range,
                  chapter_zh_values_json = excluded.chapter_zh_values_json,
                  record_ids_json = excluded.record_ids_json,
                  ko_pool_text = excluded.ko_pool_text,
                  confidence_threshold = excluded.confidence_threshold,
                  total_reviews = excluded.total_reviews,
                  pending_reviews = excluded.pending_reviews,
                  auto_applied_reviews = excluded.auto_applied_reviews,
                  status = excluded.status,
                  notes = excluded.notes,
                  updated_at = excluded.updated_at
                """,
                (
                    batch_id,
                    str(batch.get("book", "") or ""),
                    str(batch.get("chapter_range", "") or ""),
                    self._serialize(list(batch.get("chapter_zh_values", []))),
                    self._serialize(list(batch.get("record_ids", []))),
                    str(batch.get("ko_pool_text", "") or ""),
                    float(batch.get("confidence_threshold", 0) or 0),
                    int(batch.get("total_reviews", 0) or 0),
                    int(batch.get("pending_reviews", 0) or 0),
                    int(batch.get("auto_applied_reviews", 0) or 0),
                    str(batch.get("status", "pending_review") or "pending_review"),
                    str(batch.get("notes", "") or ""),
                    created_at,
                    now,
                ),
            )
            row = connection.execute(
                "select * from alignment_batches where batch_id = ? limit 1",
                (batch_id,),
            ).fetchone()
        return self._row_to_batch(row) if row else {}

    def get_batch(self, batch_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "select * from alignment_batches where batch_id = ? limit 1",
                (batch_id,),
            ).fetchone()
        if not row:
            return None
        return self._row_to_batch(row)

    def list_batches(self, *, book: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        query = "select * from alignment_batches"
        params: list[Any] = []
        if book:
            query += " where book = ?"
            params.append(book)
        query += " order by created_at desc limit ?"
        params.append(limit)
        with self._connection() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._row_to_batch(row) for row in rows]
