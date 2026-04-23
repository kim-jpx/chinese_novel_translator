"""SQLite-backed background job store for upload and extract workflows."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import uuid
from typing import Any


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteJobStore:
    """Persist background job state across backend restarts."""

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
                create table if not exists background_jobs (
                  job_id text primary key,
                  job_type text not null,
                  status text not null,
                  result_json text,
                  error text,
                  created_at text not null,
                  updated_at text not null
                )
                """
            )
            connection.execute(
                """
                create index if not exists background_jobs_type_created_idx
                on background_jobs (job_type, created_at desc)
                """
            )

    def _serialize_result(self, result: dict[str, Any] | None) -> str | None:
        if result is None:
            return None
        return json.dumps(result, ensure_ascii=False)

    def _deserialize_result(self, raw: str | None) -> dict[str, Any] | None:
        if not raw:
            return None
        return json.loads(raw)

    def prune(self, *, job_type: str, ttl_seconds: int, max_entries: int) -> None:
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=ttl_seconds)).isoformat()
        with self._connection() as connection:
            connection.execute(
                "delete from background_jobs where job_type = ? and created_at < ?",
                (job_type, cutoff),
            )

            row = connection.execute(
                "select count(*) as total from background_jobs where job_type = ?",
                (job_type,),
            ).fetchone()
            total = int(row["total"]) if row else 0
            overflow = max(total - max_entries, 0)
            if overflow <= 0:
                return

            stale_rows = connection.execute(
                """
                select job_id
                from background_jobs
                where job_type = ?
                order by created_at asc
                limit ?
                """,
                (job_type, overflow),
            ).fetchall()
            if stale_rows:
                connection.executemany(
                    "delete from background_jobs where job_id = ?",
                    [(row["job_id"],) for row in stale_rows],
                )

    def create_job(self, *, job_type: str) -> str:
        job_id = uuid.uuid4().hex
        now = utc_now_iso()
        with self._connection() as connection:
            connection.execute(
                """
                insert into background_jobs (
                  job_id, job_type, status, result_json, error, created_at, updated_at
                ) values (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, job_type, "queued", None, None, now, now),
            )
        return job_id

    def update_job(
        self,
        *,
        job_id: str,
        status: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
                update background_jobs
                set status = ?, result_json = ?, error = ?, updated_at = ?
                where job_id = ?
                """,
                (
                    status,
                    self._serialize_result(result),
                    error,
                    utc_now_iso(),
                    job_id,
                ),
            )

    def get_job(self, *, job_id: str, job_type: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                select job_id, status, result_json, error, created_at
                from background_jobs
                where job_id = ? and job_type = ?
                limit 1
                """,
                (job_id, job_type),
            ).fetchone()
        if not row:
            return None
        return {
            "job_id": row["job_id"],
            "status": row["status"],
            "result": self._deserialize_result(row["result_json"]),
            "error": row["error"],
            "created_at": row["created_at"],
        }

    def list_jobs(self, *, job_type: str, limit: int) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                select job_id, status, result_json, error, created_at
                from background_jobs
                where job_type = ?
                order by created_at desc
                limit ?
                """,
                (job_type, limit),
            ).fetchall()
        return [
            {
                "job_id": row["job_id"],
                "status": row["status"],
                "result": self._deserialize_result(row["result_json"]),
                "error": row["error"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
