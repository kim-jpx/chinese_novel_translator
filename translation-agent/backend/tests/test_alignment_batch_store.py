import tempfile
import unittest
from pathlib import Path

from backend.storage.alignment_batch_store import SQLiteAlignmentBatchStore


class SQLiteAlignmentBatchStoreTests(unittest.TestCase):
    def test_batch_persists_across_store_instances(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "alignment.sqlite3"
            store = SQLiteAlignmentBatchStore(db_path)
            store.upsert_batch(
                {
                    "batch_id": "batch-1",
                    "book": "지존신의",
                    "chapter_range": "1-3",
                    "chapter_zh_values": [1, 2, 3],
                    "record_ids": ["a", "b", "c"],
                    "ko_pool_text": "첫 화\n둘째 화\n셋째 화",
                    "confidence_threshold": 0.82,
                    "total_reviews": 3,
                    "pending_reviews": 1,
                    "auto_applied_reviews": 2,
                    "status": "pending_review",
                    "notes": "test batch",
                }
            )

            reloaded = SQLiteAlignmentBatchStore(db_path)
            batch = reloaded.get_batch("batch-1")

        self.assertIsNotNone(batch)
        self.assertEqual(batch["book"], "지존신의")
        self.assertEqual(batch["chapter_zh_values"], [1, 2, 3])
        self.assertEqual(batch["record_ids"], ["a", "b", "c"])
        self.assertEqual(batch["pending_reviews"], 1)

    def test_list_batches_returns_latest_first(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "alignment.sqlite3"
            store = SQLiteAlignmentBatchStore(db_path)
            store.upsert_batch({"batch_id": "batch-1", "book": "교술", "chapter_range": "1", "ko_pool_text": "a"})
            store.upsert_batch({"batch_id": "batch-2", "book": "교술", "chapter_range": "2", "ko_pool_text": "b"})

            batches = store.list_batches(book="교술", limit=10)

        self.assertEqual([batch["batch_id"] for batch in batches], ["batch-2", "batch-1"])


if __name__ == "__main__":
    unittest.main()
