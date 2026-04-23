from __future__ import annotations

import unittest

from backend.storage.migration import (
    dedupe_dataset_records,
    merge_records_for_sync,
    normalize_glossary_terms,
)


class MigrationHelpersTest(unittest.TestCase):
    def test_dedupe_dataset_records_merges_duplicate_canonical_pairs(self):
        records = [
            {
                "id": "older",
                "book": "명란전",
                "book_zh": "庶女明兰传",
                "chapter_ko": 1,
                "chapter_zh": "1",
                "zh_text": "원문",
                "ko_text": "",
                "updated_at": "2024-01-01T00:00:00+00:00",
            },
            {
                "id": "newer",
                "book": "명란전",
                "book_zh": "庶女明兰传",
                "chapter_ko": 1,
                "chapter_zh": "1",
                "zh_text": "원문 수정",
                "ko_text": "번역문",
                "updated_at": "2024-01-02T00:00:00+00:00",
            },
        ]

        deduped, report = dedupe_dataset_records(records)

        self.assertEqual(len(deduped), 1)
        self.assertEqual(deduped[0]["id"], "newer")
        self.assertEqual(deduped[0]["ko_text"], "번역문")
        self.assertEqual(deduped[0]["zh_text"], "원문 수정")
        self.assertEqual(report["duplicate_groups"], 1)
        self.assertEqual(report["duplicate_records"], 1)
        self.assertEqual(report["conflicts"], 1)

    def test_merge_records_for_sync_preserves_confirmed_state(self):
        existing = {
            "id": "same",
            "book": "명란전",
            "chapter_ko": 1,
            "chapter_zh": "1",
            "ko_text": "초안",
            "status": "draft",
            "updated_at": "2024-01-01T00:00:00+00:00",
        }
        incoming = {
            "id": "same",
            "book": "명란전",
            "chapter_ko": 1,
            "chapter_zh": "1",
            "ko_text": "수정 초안",
            "ko_text_confirmed": "확정 번역",
            "status": "confirmed",
            "human_reviewed": True,
            "updated_at": "2024-01-02T00:00:00+00:00",
        }

        merged, had_conflict = merge_records_for_sync(existing, incoming)

        self.assertTrue(had_conflict)
        self.assertEqual(merged["status"], "confirmed")
        self.assertEqual(merged["ko_text_confirmed"], "확정 번역")
        self.assertTrue(merged["human_reviewed"])

    def test_normalize_glossary_terms_dedupes_by_term_and_book(self):
        terms = [
            {
                "term_zh": "明兰",
                "term_ko": "명란",
                "book": "명란전",
                "domain": "",
                "notes": "",
            },
            {
                "term_zh": "明兰",
                "term_ko": "성명란",
                "book": "",
                "domain": "명란전",
                "notes": "주인공",
            },
        ]

        normalized = normalize_glossary_terms(terms)

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]["book"], "명란전")
        self.assertEqual(normalized[0]["domain"], "명란전")
        self.assertEqual(normalized[0]["term_ko"], "성명란")
        self.assertEqual(normalized[0]["notes"], "주인공")


if __name__ == "__main__":
    unittest.main()
