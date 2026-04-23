"""Dataset repository implementations for Supabase and local JSONL."""

from __future__ import annotations

import json
from pathlib import Path
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import certifi

from backend.storage.config import (
    get_dataset_backend,
    get_dataset_path,
    get_supabase_service_role_key,
    get_supabase_url,
    is_supabase_configured,
)
from backend.storage.dataset_utils import (
    apply_dataset_defaults,
    build_book_summaries,
    build_canonical_pair_key,
    build_dataset_stats,
    chapter_zh_primary_value,
    expand_chapter_zh,
    normalize_book_key,
    prepare_record_for_storage,
    sort_dataset_records,
    strip_storage_fields,
)


class DatasetRepositoryError(RuntimeError):
    """Raised when the dataset repository cannot fulfill a request."""


class DatasetBackendUnavailableError(DatasetRepositoryError):
    """Raised when the configured dataset backend is unavailable."""


def _build_ssl_context() -> ssl.SSLContext:
    """Use the certifi CA bundle so HTTPS works reliably on local macOS Python installs."""

    return ssl.create_default_context(cafile=certifi.where())


def _atomic_write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        for record in sort_dataset_records(records):
            handle.write(json.dumps(strip_storage_fields(record), ensure_ascii=False) + "\n")
    temp_path.replace(path)


def _filter_records(
    records: list[dict[str, Any]],
    *,
    book: str | None = None,
    book_exact: str | None = None,
    chapter_ko: int | None = None,
    chapter_zh: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    filtered = sort_dataset_records(records)
    if book_exact:
        exact_book = book_exact.strip()
        filtered = [record for record in filtered if str(record.get("book", "")).strip() == exact_book]
    if book:
        lower_book = book.lower()
        filtered = [
            record for record in filtered if lower_book in str(record.get("book", "")).lower()
        ]
    if chapter_ko is not None:
        filtered = [
            record for record in filtered if int(record.get("chapter_ko", -1) or -1) == chapter_ko
        ]
    if chapter_zh:
        target_chapters = set(expand_chapter_zh(chapter_zh))
        if target_chapters:
            filtered = [
                record
                for record in filtered
                if target_chapters.intersection(
                    set(expand_chapter_zh(str(record.get("chapter_zh", ""))))
                )
            ]
        else:
            filtered = [
                record
                for record in filtered
                if str(record.get("chapter_zh", "")).strip() == chapter_zh.strip()
            ]
    if status:
        filtered = [
            record for record in filtered if str(record.get("status", "")).strip() == status.strip()
        ]
    return filtered


def _unique_books(records: list[dict[str, Any]]) -> list[str]:
    return sorted({str(record.get("book", "")).strip() for record in records if str(record.get("book", "")).strip()})


class JsonlDatasetRepository:
    """Local JSONL repository used for testing and migration tools."""

    def __init__(self, dataset_path: Path | None = None):
        self.dataset_path = dataset_path or get_dataset_path()

    def ping(self) -> bool:
        return True

    def list_records(
        self,
        *,
        book: str | None = None,
        book_exact: str | None = None,
        chapter_ko: int | None = None,
        chapter_zh: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        if not self.dataset_path.exists():
            return []
        records: list[dict[str, Any]] = []
        for line in self.dataset_path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if raw:
                records.append(apply_dataset_defaults(json.loads(raw)))
        return _filter_records(
            records,
            book=book,
            book_exact=book_exact,
            chapter_ko=chapter_ko,
            chapter_zh=chapter_zh,
            status=status,
        )

    def get_record(self, record_id: str) -> dict[str, Any] | None:
        return next((record for record in self.list_records() if record.get("id") == record_id), None)

    def get_by_canonical_pair(
        self, canonical_book_key: str, chapter_zh_primary: int
    ) -> dict[str, Any] | None:
        for record in self.list_records():
            prepared = prepare_record_for_storage(record)
            if (
                prepared.get("canonical_book_key") == canonical_book_key
                and int(prepared.get("chapter_zh_primary", 0) or 0) == chapter_zh_primary
            ):
                return strip_storage_fields(prepared)
        return None

    def create_record(self, record: dict[str, Any]) -> dict[str, Any]:
        records = self.list_records()
        if any(existing.get("id") == record.get("id") for existing in records):
            raise DatasetRepositoryError(f"이미 존재하는 레코드: {record.get('id')}")
        records.append(prepare_record_for_storage(record))
        _atomic_write_jsonl(self.dataset_path, records)
        return strip_storage_fields(prepare_record_for_storage(record))

    def update_record(self, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
        records = self.list_records()
        updated = prepare_record_for_storage(record)
        for index, existing in enumerate(records):
            if existing.get("id") == record_id:
                records[index] = updated
                _atomic_write_jsonl(self.dataset_path, records)
                return strip_storage_fields(updated)
        raise DatasetRepositoryError(f"레코드 없음: {record_id}")

    def delete_record(self, record_id: str) -> bool:
        records = self.list_records()
        filtered = [record for record in records if record.get("id") != record_id]
        if len(filtered) == len(records):
            return False
        _atomic_write_jsonl(self.dataset_path, filtered)
        return True

    def replace_all(self, records: list[dict[str, Any]]) -> None:
        prepared = [prepare_record_for_storage(record) for record in records]
        _atomic_write_jsonl(self.dataset_path, prepared)

    def get_book_summaries(self) -> list[dict[str, Any]]:
        return build_book_summaries(self.list_records())

    def get_dataset_stats(self, glossary_terms: int) -> dict[str, Any]:
        return build_dataset_stats(self.list_records(), glossary_terms)


class SupabaseDatasetRepository:
    """Supabase PostgREST repository used by the live backend."""

    table_name = "dataset_records"
    full_select = "*"
    summary_select = "book,book_ko,book_zh,chapter_ko,chapter_zh,genre,zh_text,status"
    books_select = "book"

    def __init__(self):
        if not is_supabase_configured():
            raise DatasetBackendUnavailableError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured."
            )
        self.supabase_url = get_supabase_url()
        self.service_role_key = get_supabase_service_role_key()
        self.rest_base = f"{self.supabase_url}/rest/v1"
        self.ssl_context = _build_ssl_context()

    def _build_query(self, params: dict[str, str]) -> str:
        if not params:
            return ""
        safe = "(),.*:-"
        return urllib.parse.urlencode(params, safe=safe)

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: dict[str, Any] | list[dict[str, Any]] | None = None,
    ) -> tuple[bytes, Any]:
        query = self._build_query(params or {})
        url = f"{self.rest_base}{path}"
        if query:
            url = f"{url}?{query}"

        payload = None
        if body is not None:
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")

        request_headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Accept": "application/json",
        }
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
        if headers:
            request_headers.update(headers)

        req = urllib.request.Request(url, data=payload, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20, context=self.ssl_context) as response:
                return response.read(), response.headers
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "ignore")
            raise DatasetRepositoryError(
                f"Supabase request failed ({exc.code}): {detail or exc.reason}"
            ) from exc
        except urllib.error.URLError as exc:
            raise DatasetBackendUnavailableError(f"Supabase connection failed: {exc.reason}") from exc

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: dict[str, Any] | list[dict[str, Any]] | None = None,
    ) -> Any:
        raw, _ = self._request(
            method,
            path,
            params=params,
            headers=headers,
            body=body,
        )
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))

    def _count_records(self, *, status: str | None = None, with_source_text: bool = False) -> int:
        params = {"select": "id"}
        if status:
            params["status"] = f"eq.{status}"
        if with_source_text:
            params["zh_text"] = "not.eq."

        _, headers = self._request(
            "HEAD",
            f"/{self.table_name}",
            params=params,
            headers={"Prefer": "count=exact"},
        )
        content_range = headers.get("Content-Range", "")
        if "/" not in content_range:
            return 0
        total = content_range.rsplit("/", 1)[-1].strip()
        return int(total) if total.isdigit() else 0

    def _build_server_filters(
        self,
        *,
        book: str | None = None,
        book_exact: str | None = None,
        chapter_ko: int | None = None,
        status: str | None = None,
    ) -> dict[str, str]:
        params: dict[str, str] = {}
        if book_exact:
            params["book"] = f"eq.{book_exact.strip()}"
        elif book:
            escaped = book.replace("*", "").strip()
            if escaped:
                params["book"] = f"ilike.*{escaped}*"
        if chapter_ko is not None:
            params["chapter_ko"] = f"eq.{chapter_ko}"
        if status:
            params["status"] = f"eq.{status.strip()}"
        return params

    def _fetch_records(
        self,
        *,
        select: str,
        order: str,
        book: str | None = None,
        book_exact: str | None = None,
        chapter_ko: int | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        page_size = 500
        start = 0
        records: list[dict[str, Any]] = []
        base_params = self._build_server_filters(
            book=book,
            book_exact=book_exact,
            chapter_ko=chapter_ko,
            status=status,
        )
        base_params["select"] = select
        base_params["order"] = order

        while True:
            page = self._request_json(
                "GET",
                f"/{self.table_name}",
                params=base_params,
                headers={
                    "Range-Unit": "items",
                    "Range": f"{start}-{start + page_size - 1}",
                },
            )
            if not page:
                break
            page_records = [apply_dataset_defaults(record) for record in page]
            records.extend(page_records)
            if len(page_records) < page_size:
                break
            start += page_size
        return records

    def ping(self) -> bool:
        try:
            self._request_json(
                "GET",
                f"/{self.table_name}",
                params={"select": "id", "limit": "1"},
            )
            return True
        except DatasetRepositoryError:
            return False

    def _fetch_all_records(self) -> list[dict[str, Any]]:
        return sort_dataset_records(
            self._fetch_records(select=self.full_select, order="book.asc,chapter_ko.asc,id.asc")
        )

    def list_records(
        self,
        *,
        book: str | None = None,
        book_exact: str | None = None,
        chapter_ko: int | None = None,
        chapter_zh: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        records = self._fetch_records(
            select=self.full_select,
            order="book.asc,chapter_ko.asc,id.asc",
            book=book,
            book_exact=book_exact,
            chapter_ko=chapter_ko,
            status=status,
        )
        return _filter_records(
            records,
            book=book,
            book_exact=book_exact,
            chapter_ko=chapter_ko,
            chapter_zh=chapter_zh,
            status=status,
        )

    def get_record(self, record_id: str) -> dict[str, Any] | None:
        rows = self._request_json(
            "GET",
            f"/{self.table_name}",
            params={"select": "*", "id": f"eq.{record_id}", "limit": "1"},
        )
        if not rows:
            return None
        return strip_storage_fields(apply_dataset_defaults(rows[0]))

    def get_by_canonical_pair(
        self, canonical_book_key: str, chapter_zh_primary: int
    ) -> dict[str, Any] | None:
        rows = self._request_json(
            "GET",
            f"/{self.table_name}",
            params={
                "select": "*",
                "canonical_book_key": f"eq.{canonical_book_key}",
                "chapter_zh_primary": f"eq.{chapter_zh_primary}",
                "limit": "1",
            },
        )
        if not rows:
            return None
        return strip_storage_fields(apply_dataset_defaults(rows[0]))

    def create_record(self, record: dict[str, Any]) -> dict[str, Any]:
        prepared = prepare_record_for_storage(record)
        rows = self._request_json(
            "POST",
            f"/{self.table_name}",
            params={"select": "*"},
            headers={"Prefer": "return=representation"},
            body=prepared,
        )
        if not rows:
            raise DatasetRepositoryError("Supabase did not return the inserted record.")
        if isinstance(rows, list):
            return strip_storage_fields(apply_dataset_defaults(rows[0]))
        return strip_storage_fields(apply_dataset_defaults(rows))

    def update_record(self, record_id: str, record: dict[str, Any]) -> dict[str, Any]:
        prepared = prepare_record_for_storage(record)
        rows = self._request_json(
            "PATCH",
            f"/{self.table_name}",
            params={"select": "*", "id": f"eq.{record_id}"},
            headers={"Prefer": "return=representation"},
            body=prepared,
        )
        if not rows:
            raise DatasetRepositoryError(f"레코드 없음: {record_id}")
        return strip_storage_fields(apply_dataset_defaults(rows[0]))

    def delete_record(self, record_id: str) -> bool:
        rows = self._request_json(
            "DELETE",
            f"/{self.table_name}",
            params={"select": "id", "id": f"eq.{record_id}"},
            headers={"Prefer": "return=representation"},
        )
        return bool(rows)

    def replace_all(self, records: list[dict[str, Any]]) -> None:
        self._request_json(
            "DELETE",
            f"/{self.table_name}",
            params={"id": "not.is.null"},
        )
        if not records:
            return

        chunk_size = 200
        prepared = [prepare_record_for_storage(record) for record in records]
        for start in range(0, len(prepared), chunk_size):
            chunk = prepared[start:start + chunk_size]
            self._request_json(
                "POST",
                f"/{self.table_name}",
                headers={"Prefer": "return=minimal"},
                body=chunk,
            )

    def get_book_summaries(self) -> list[dict[str, Any]]:
        records = self._fetch_records(
            select=self.summary_select,
            order="book.asc,chapter_ko.asc,id.asc",
        )
        return build_book_summaries(records)

    def get_dataset_stats(self, glossary_terms: int) -> dict[str, Any]:
        book_records = self._fetch_records(
            select=self.books_select,
            order="book.asc",
        )
        books = _unique_books(book_records)
        source_count = self._count_records(with_source_text=True)
        confirmed = self._count_records(status="confirmed")
        draft = self._count_records(status="draft")
        return {
            "total_records": self._count_records(),
            "total_books": len(books),
            "books": books,
            "records_with_source_text": source_count,
            "records_with_zh": source_count,
            "glossary_terms": glossary_terms,
            "confirmed": confirmed,
            "draft": draft,
        }


def get_dataset_repository():
    backend = get_dataset_backend()
    if backend == "file":
        return JsonlDatasetRepository()
    if backend == "supabase":
        return SupabaseDatasetRepository()
    raise DatasetBackendUnavailableError(f"Unsupported dataset backend: {backend}")


def canonical_pair_for_record(record: dict[str, Any]) -> tuple[str, int]:
    prepared = prepare_record_for_storage(record)
    return (
        str(prepared.get("canonical_book_key", "")),
        int(prepared.get("chapter_zh_primary", 0) or 0),
    )


def canonical_pair_for_values(book_zh: str, book_ko: str, book: str, chapter_zh: str, chapter_ko: int) -> tuple[str, int]:
    canonical_book_key = normalize_book_key(book_zh, book_ko, book)
    chapter_zh_primary = chapter_zh_primary_value(chapter_zh, chapter_ko)
    return canonical_book_key, chapter_zh_primary


def build_pair_key_string(book_zh: str, book_ko: str, book: str, chapter_zh: str, chapter_ko: int) -> str:
    canonical_book_key, chapter_zh_primary = canonical_pair_for_values(
        book_zh,
        book_ko,
        book,
        chapter_zh,
        chapter_ko,
    )
    return build_canonical_pair_key(canonical_book_key, chapter_zh_primary)
