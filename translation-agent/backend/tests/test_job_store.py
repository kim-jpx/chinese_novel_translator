import tempfile
import unittest
from pathlib import Path

from backend.storage.job_store import SQLiteJobStore


class SQLiteJobStoreTests(unittest.TestCase):
    def test_job_persists_across_store_instances(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "jobs.sqlite3"
            store = SQLiteJobStore(db_path)
            job_id = store.create_job(job_type="upload")
            store.update_job(
                job_id=job_id,
                status="completed",
                result={"book": "지존신의", "chapter": 1},
            )

            reloaded = SQLiteJobStore(db_path)
            job = reloaded.get_job(job_id=job_id, job_type="upload")

        self.assertIsNotNone(job)
        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["result"]["book"], "지존신의")

    def test_list_jobs_returns_latest_first(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "jobs.sqlite3"
            store = SQLiteJobStore(db_path)
            first_id = store.create_job(job_type="upload")
            second_id = store.create_job(job_type="upload")

            jobs = store.list_jobs(job_type="upload", limit=10)

        self.assertEqual([job["job_id"] for job in jobs], [second_id, first_id])

    def test_prune_keeps_only_recent_entries_per_type(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "jobs.sqlite3"
            store = SQLiteJobStore(db_path)
            ids = [store.create_job(job_type="extract") for _ in range(3)]

            store.prune(job_type="extract", ttl_seconds=3600, max_entries=2)
            jobs = store.list_jobs(job_type="extract", limit=10)

        self.assertEqual(len(jobs), 2)
        self.assertEqual([job["job_id"] for job in jobs], ids[-2:][::-1])
