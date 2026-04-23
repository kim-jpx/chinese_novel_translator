"""SQLite-backed draft snapshot history for dataset records."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import threading
import uuid
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteDraftHistoryStore:
    """Persist save-time snapshots so draft edits can be restored later."""

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
                create table if not exists draft_history (
                  id text primary key,
                  record_id text not null,
                  book text not null default '',
                  chapter_ko integer not null default 0,
                  chapter_zh text not null default '',
                  zh_text text not null default '',
                  ko_text text not null default '',
                  ko_text_confirmed text not null default '',
                  review_note text not null default '',
                  notes text not null default '',
                  status text not null default 'draft',
                  source text not null default 'save',
                  created_at text not null
                )
                """
            )
            columns = {
                row["name"]
                for row in connection.execute("pragma table_info(draft_history)").fetchall()
            }
            if "notes" not in columns:
                connection.execute(
                    "alter table draft_history add column notes text not null default ''"
                )
            connection.execute(
                """
                create index if not exists draft_history_record_created_idx
                on draft_history (record_id, created_at desc)
                """
            )

    def _row_to_item(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "record_id": row["record_id"],
            "book": row["book"],
            "chapter_ko": int(row["chapter_ko"] or 0),
            "chapter_zh": row["chapter_zh"],
            "zh_text": row["zh_text"],
            "ko_text": row["ko_text"],
            "ko_text_confirmed": row["ko_text_confirmed"],
            "review_note": row["review_note"],
            "notes": row["notes"],
            "status": row["status"],
            "source": row["source"],
            "created_at": row["created_at"],
        }

    def append_snapshot(self, record: dict[str, Any], *, source: str = "save") -> dict[str, Any]:
        history_id = uuid.uuid4().hex
        now = utc_now_iso()
        values = (
            history_id,
            str(record.get("id", "")),
            str(record.get("book", "")),
            int(record.get("chapter_ko", 0) or 0),
            str(record.get("chapter_zh", "")),
            str(record.get("zh_text", "")),
            str(record.get("ko_text", "")),
            str(record.get("ko_text_confirmed", "")),
            str(record.get("review_note", "")),
            str(record.get("notes", "")),
            str(record.get("status", "draft") or "draft"),
            source,
            now,
        )
        with self._connection() as connection:
            connection.execute(
                """
                insert into draft_history (
                  id, record_id, book, chapter_ko, chapter_zh, zh_text, ko_text,
                  ko_text_confirmed, review_note, notes, status, source, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                values,
            )
            row = connection.execute(
                "select * from draft_history where id = ? limit 1",
                (history_id,),
            ).fetchone()
        return self._row_to_item(row) if row else {}

    def list_snapshots(self, record_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit or 50), 200))
        with self._connection() as connection:
            rows = connection.execute(
                """
                select *
                from draft_history
                where record_id = ?
                order by created_at desc
                limit ?
                """,
                (record_id, safe_limit),
            ).fetchall()
        return [self._row_to_item(row) for row in rows]

    def get_snapshot(self, record_id: str, history_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                select *
                from draft_history
                where record_id = ? and id = ?
                limit 1
                """,
                (record_id, history_id),
            ).fetchone()
        return self._row_to_item(row) if row else None


_store_lock = threading.Lock()
_store_instance: SQLiteDraftHistoryStore | None = None


def get_draft_history_store() -> SQLiteDraftHistoryStore:
    from backend.storage.config import get_draft_history_store_path

    global _store_instance
    with _store_lock:
        if _store_instance is None:
            _store_instance = SQLiteDraftHistoryStore(get_draft_history_store_path())
        return _store_instance
