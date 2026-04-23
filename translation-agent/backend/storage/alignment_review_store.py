"""SQLite-backed persistence for source-chapter alignment reviews."""

from __future__ import annotations

from datetime import datetime, timezone
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_alignment_review_id(record_id: str, chapter_zh: str) -> str:
    return f"{record_id}:{chapter_zh.strip() or 'unknown'}"


class SQLiteAlignmentReviewStore:
    """Persist pending alignment reviews across backend restarts."""

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
                create table if not exists alignment_reviews (
                  review_id text primary key,
                  record_id text not null,
                  book text not null,
                  chapter_ko integer not null,
                  chapter_zh text not null,
                  existing_ko_text text not null default '',
                  proposed_ko_text text not null default '',
                  batch_id text not null default '',
                  batch_label text not null default '',
                  batch_index integer not null default 0,
                  batch_total integer not null default 0,
                  confidence real not null default 0,
                  warnings_json text not null default '[]',
                  start_reason text not null default '',
                  end_reason text not null default '',
                  status text not null default 'pending',
                  created_at text not null,
                  updated_at text not null
                )
                """
            )
            connection.execute(
                """
                create index if not exists alignment_reviews_status_created_idx
                on alignment_reviews (status, created_at desc)
                """
            )
            connection.execute(
                """
                create index if not exists alignment_reviews_book_status_idx
                on alignment_reviews (book, status, created_at desc)
                """
            )
            existing_columns = {
                str(row["name"])
                for row in connection.execute("pragma table_info(alignment_reviews)").fetchall()
            }
            for column_name, column_type, default_value in (
                ("batch_id", "text", "''"),
                ("batch_label", "text", "''"),
                ("batch_index", "integer", "0"),
                ("batch_total", "integer", "0"),
            ):
                if column_name in existing_columns:
                    continue
                connection.execute(
                    f"alter table alignment_reviews add column {column_name} {column_type} not null default {default_value}"
                )

    def _serialize_warnings(self, warnings: list[str]) -> str:
        return json.dumps(warnings, ensure_ascii=False)

    def _deserialize_warnings(self, raw: str | None) -> list[str]:
        if not raw:
            return []
        return [str(item) for item in json.loads(raw)]

    def _row_to_review(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "review_id": row["review_id"],
            "record_id": row["record_id"],
            "book": row["book"],
            "chapter_ko": int(row["chapter_ko"] or 0),
            "chapter_zh": row["chapter_zh"],
            "existing_ko_text": row["existing_ko_text"],
            "proposed_ko_text": row["proposed_ko_text"],
            "batch_id": row["batch_id"],
            "batch_label": row["batch_label"],
            "batch_index": int(row["batch_index"] or 0),
            "batch_total": int(row["batch_total"] or 0),
            "confidence": float(row["confidence"] or 0),
            "warnings": self._deserialize_warnings(row["warnings_json"]),
            "start_reason": row["start_reason"],
            "end_reason": row["end_reason"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "status": row["status"],
        }

    def upsert_review(self, review: dict[str, Any]) -> dict[str, Any]:
        review_id = str(review.get("review_id") or make_alignment_review_id(
            str(review.get("record_id", "")),
            str(review.get("chapter_zh", "")),
        ))
        now = utc_now_iso()
        with self._connection() as connection:
            existing = connection.execute(
                "select created_at from alignment_reviews where review_id = ? limit 1",
                (review_id,),
            ).fetchone()
            created_at = existing["created_at"] if existing else now
            connection.execute(
                """
                insert into alignment_reviews (
                  review_id, record_id, book, chapter_ko, chapter_zh,
                  existing_ko_text, proposed_ko_text, batch_id, batch_label, batch_index, batch_total,
                  confidence, warnings_json,
                  start_reason, end_reason, status, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(review_id) do update set
                  record_id = excluded.record_id,
                  book = excluded.book,
                  chapter_ko = excluded.chapter_ko,
                  chapter_zh = excluded.chapter_zh,
                  existing_ko_text = excluded.existing_ko_text,
                  proposed_ko_text = excluded.proposed_ko_text,
                  batch_id = excluded.batch_id,
                  batch_label = excluded.batch_label,
                  batch_index = excluded.batch_index,
                  batch_total = excluded.batch_total,
                  confidence = excluded.confidence,
                  warnings_json = excluded.warnings_json,
                  start_reason = excluded.start_reason,
                  end_reason = excluded.end_reason,
                  status = excluded.status,
                  updated_at = excluded.updated_at
                """,
                (
                    review_id,
                    str(review.get("record_id", "")),
                    str(review.get("book", "")),
                    int(review.get("chapter_ko", 0) or 0),
                    str(review.get("chapter_zh", "")),
                    str(review.get("existing_ko_text", "")),
                    str(review.get("proposed_ko_text", "")),
                    str(review.get("batch_id", "") or ""),
                    str(review.get("batch_label", "") or ""),
                    int(review.get("batch_index", 0) or 0),
                    int(review.get("batch_total", 0) or 0),
                    float(review.get("confidence", 0) or 0),
                    self._serialize_warnings(list(review.get("warnings", []))),
                    str(review.get("start_reason", "")),
                    str(review.get("end_reason", "")),
                    str(review.get("status", "pending") or "pending"),
                    created_at,
                    now,
                ),
            )
            row = connection.execute(
                "select * from alignment_reviews where review_id = ? limit 1",
                (review_id,),
            ).fetchone()
        return self._row_to_review(row) if row else {}

    def get_review(self, review_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "select * from alignment_reviews where review_id = ? limit 1",
                (review_id,),
            ).fetchone()
        if not row:
            return None
        return self._row_to_review(row)

    def list_reviews(
        self,
        *,
        status: str = "pending",
        book: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = "select * from alignment_reviews where status = ?"
        params: list[Any] = [status]
        if book:
            query += " and book = ?"
            params.append(book)
        query += " order by created_at desc limit ?"
        params.append(limit)
        with self._connection() as connection:
            rows = connection.execute(query, tuple(params)).fetchall()
        return [self._row_to_review(row) for row in rows]

    def resolve_review(self, review_id: str, *, status: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            connection.execute(
                """
                update alignment_reviews
                set status = ?, updated_at = ?
                where review_id = ?
                """,
                (status, utc_now_iso(), review_id),
            )
            row = connection.execute(
                "select * from alignment_reviews where review_id = ? limit 1",
                (review_id,),
            ).fetchone()
        if not row:
            return None
        return self._row_to_review(row)
