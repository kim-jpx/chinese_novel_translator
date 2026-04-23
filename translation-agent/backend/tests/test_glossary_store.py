import os
import unittest

os.environ["DATASET_BACKEND"] = "file"

from backend.storage.glossary_store import backfill_glossary_term_meanings


class GlossaryStoreTests(unittest.TestCase):
    def test_backfill_glossary_term_meanings_uses_explicit_parenthetical_pairs(self):
        terms = [
            {
                "term_zh": "天令皇朝",
                "term_ko": "",
                "book": "지존신의",
                "domain": "지존신의",
                "pos": "미분류",
                "policy": "검토중",
                "notes": "업로드 후보 자동 승격",
            }
        ]
        records = [
            {
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "zh_text": "她是天令皇朝的帝姬。",
                "ko_text": "그녀는 천령황조(天令皇朝)의 제희였다.",
                "ko_text_confirmed": "",
            }
        ]

        updated, updated_count = backfill_glossary_term_meanings(terms, records)

        self.assertEqual(updated_count, 1)
        self.assertEqual(updated[0]["term_ko"], "천령황조")
        self.assertEqual(updated[0]["term_meaning_ko"], "천령황조")
        self.assertIn("예문 병기 자동 추정", updated[0]["notes"])
        self.assertIn("원문 뜻 자동 추정", updated[0]["notes"])

    def test_backfill_glossary_term_meanings_skips_ambiguous_candidates(self):
        terms = [
            {
                "term_zh": "天令皇朝",
                "term_ko": "",
                "book": "지존신의",
                "domain": "지존신의",
                "pos": "미분류",
                "policy": "검토중",
                "notes": "업로드 후보 자동 승격",
            }
        ]
        records = [
            {
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "zh_text": "天令皇朝国力强盛。",
                "ko_text": "천령황조(天令皇朝)의 국력은 강했다.",
                "ko_text_confirmed": "",
            },
            {
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "zh_text": "天令皇朝人人敬畏。",
                "ko_text": "천령제국(天令皇朝)을 모두가 두려워했다.",
                "ko_text_confirmed": "",
            },
        ]

        updated, updated_count = backfill_glossary_term_meanings(terms, records)

        self.assertEqual(updated_count, 0)
        self.assertEqual(updated[0]["term_ko"], "")
        self.assertEqual(updated[0]["term_meaning_ko"], "")


if __name__ == "__main__":
    unittest.main()
