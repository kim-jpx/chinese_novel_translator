import tempfile
import unittest
from pathlib import Path

from backend.storage.alignment_review_store import (
    SQLiteAlignmentReviewStore,
    make_alignment_review_id,
)


class SQLiteAlignmentReviewStoreTests(unittest.TestCase):
    def test_review_persists_across_store_instances(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "alignment.sqlite3"
            store = SQLiteAlignmentReviewStore(db_path)
            review_id = make_alignment_review_id("record-1", "12")
            store.upsert_review(
                {
                    "review_id": review_id,
                    "record_id": "record-1",
                    "book": "지존신의",
                    "chapter_ko": 12,
                    "chapter_zh": "12",
                    "existing_ko_text": "기존",
                    "proposed_ko_text": "제안",
                    "confidence": 0.61,
                    "warnings": ["leading_overflow"],
                    "start_reason": "start",
                    "end_reason": "end",
                    "status": "pending",
                }
            )

            reloaded = SQLiteAlignmentReviewStore(db_path)
            review = reloaded.get_review(review_id)

        self.assertIsNotNone(review)
        self.assertEqual(review["record_id"], "record-1")
        self.assertEqual(review["warnings"], ["leading_overflow"])
        self.assertEqual(review["status"], "pending")
        self.assertEqual(review["batch_id"], "")
        self.assertEqual(review["batch_total"], 0)

    def test_list_reviews_returns_pending_latest_first(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "alignment.sqlite3"
            store = SQLiteAlignmentReviewStore(db_path)
            first_id = make_alignment_review_id("record-1", "1")
            second_id = make_alignment_review_id("record-2", "2")
            store.upsert_review(
                {
                    "review_id": first_id,
                    "record_id": "record-1",
                    "book": "교술",
                    "chapter_ko": 1,
                    "chapter_zh": "1",
                    "existing_ko_text": "기존1",
                    "proposed_ko_text": "제안1",
                    "confidence": 0.7,
                    "warnings": [],
                    "status": "pending",
                }
            )
            store.upsert_review(
                {
                    "review_id": second_id,
                    "record_id": "record-2",
                    "book": "교술",
                    "chapter_ko": 2,
                    "chapter_zh": "2",
                    "existing_ko_text": "기존2",
                    "proposed_ko_text": "제안2",
                    "confidence": 0.5,
                    "warnings": ["trailing_overflow"],
                    "status": "pending",
                }
            )

            reviews = store.list_reviews(status="pending", book="교술", limit=10)

        self.assertEqual([review["review_id"] for review in reviews], [second_id, first_id])

    def test_resolve_review_updates_status(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "alignment.sqlite3"
            store = SQLiteAlignmentReviewStore(db_path)
            review_id = make_alignment_review_id("record-1", "8")
            store.upsert_review(
                {
                    "review_id": review_id,
                    "record_id": "record-1",
                    "book": "지존신의",
                    "chapter_ko": 8,
                    "chapter_zh": "8",
                    "existing_ko_text": "기존",
                    "proposed_ko_text": "제안",
                    "confidence": 0.4,
                    "warnings": ["insufficient_progress"],
                    "status": "pending",
                }
            )

            resolved = store.resolve_review(review_id, status="applied")
            pending = store.list_reviews(status="pending", limit=10)

        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["status"], "applied")
        self.assertEqual(pending, [])

    def test_review_persists_batch_metadata(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "alignment.sqlite3"
            store = SQLiteAlignmentReviewStore(db_path)
            review_id = make_alignment_review_id("record-9", "21")
            store.upsert_review(
                {
                    "review_id": review_id,
                    "record_id": "record-9",
                    "book": "지존신의",
                    "chapter_ko": 21,
                    "chapter_zh": "21",
                    "existing_ko_text": "기존",
                    "proposed_ko_text": "제안",
                    "batch_id": "batch-1",
                    "batch_label": "21-25",
                    "batch_index": 2,
                    "batch_total": 5,
                    "confidence": 0.52,
                    "warnings": [],
                    "status": "pending",
                }
            )

            review = store.get_review(review_id)

        self.assertIsNotNone(review)
        self.assertEqual(review["batch_id"], "batch-1")
        self.assertEqual(review["batch_label"], "21-25")
        self.assertEqual(review["batch_index"], 2)
        self.assertEqual(review["batch_total"], 5)


if __name__ == "__main__":
    unittest.main()
