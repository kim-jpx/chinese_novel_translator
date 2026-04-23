#!/usr/bin/env python3
"""Migrate the local dataset JSONL file into Supabase."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from dotenv import load_dotenv

TRANSLATION_AGENT_DIR = Path(__file__).resolve().parent.parent
if str(TRANSLATION_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(TRANSLATION_AGENT_DIR))

load_dotenv(TRANSLATION_AGENT_DIR / "backend" / ".env")

from backend.storage.config import get_dataset_path
from backend.storage.dataset_repository import (  # noqa: E402
    JsonlDatasetRepository,
    SupabaseDatasetRepository,
)
from backend.storage.migration import (  # noqa: E402
    canonical_identity,
    dedupe_dataset_records,
    merge_records_for_sync,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=str(get_dataset_path()),
        help="Path to the source JSONL dataset file.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Calculate the migration plan without writing to Supabase.",
    )
    parser.add_argument(
        "--report-file",
        default="",
        help="Optional path to write the JSON migration report.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_repo = JsonlDatasetRepository(Path(args.source))
    target_repo = SupabaseDatasetRepository()

    source_records = source_repo.list_records()
    deduped_records, dedupe_report = dedupe_dataset_records(source_records)

    existing_records = target_repo.list_records()
    existing_by_key = {
        canonical_identity(record): record
        for record in existing_records
        if canonical_identity(record)[0] and canonical_identity(record)[1]
    }

    inserted = 0
    updated = 0
    skipped = 0
    conflicted = 0

    for source_record in deduped_records:
        key = canonical_identity(source_record)
        existing_record = existing_by_key.get(key)

        if not existing_record:
            if not args.dry_run:
                created = target_repo.create_record(source_record)
                existing_by_key[key] = created
            inserted += 1
            continue

        merged_record, had_conflict = merge_records_for_sync(existing_record, source_record)
        if had_conflict:
            conflicted += 1

        if merged_record == existing_record:
            skipped += 1
            continue

        if not args.dry_run:
            updated_record = target_repo.update_record(existing_record["id"], merged_record)
            existing_by_key[key] = updated_record
        updated += 1

    report = {
        "source_path": str(Path(args.source).resolve()),
        "dry_run": args.dry_run,
        "source_records": len(source_records),
        "deduped_records": len(deduped_records),
        "existing_target_records": len(existing_records),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "conflicted": conflicted,
        "source_duplicate_groups": dedupe_report["duplicate_groups"],
        "source_duplicate_records": dedupe_report["duplicate_records"],
        "source_duplicate_conflicts": dedupe_report["conflicts"],
    }

    payload = json.dumps(report, ensure_ascii=False, indent=2)
    print(payload)
    if args.report_file:
        Path(args.report_file).write_text(payload + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
