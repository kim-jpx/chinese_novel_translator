import os
import unittest
from unittest.mock import Mock, patch

os.environ["DATASET_BACKEND"] = "file"

from backend.storage.dataset_repository import DatasetBackendUnavailableError
from routers import glossary


class GlossaryExampleTests(unittest.TestCase):
    def test_get_term_examples_prefers_book_scope_when_book_filter_is_present(self):
        repo = Mock()
        repo.list_records.return_value = [
            {
                "id": "record-1",
                "book": "지존신의",
                "chapter_ko": 10,
                "chapter_zh": "10",
                "status": "confirmed",
                "zh_text": "她的灵力一瞬间失控了。",
                "ko_text_confirmed": "그녀의 신력이 순식간에 폭주했다.",
            }
        ]
        glossary_terms = [
            {"term_zh": "灵力", "term_ko": "영력", "term_meaning_ko": "영력", "book": "", "domain": "", "policy": "고정"},
            {"term_zh": "灵力", "term_ko": "신력", "term_meaning_ko": "신력", "book": "지존신의", "domain": "지존신의", "policy": "고정"},
        ]

        with (
            patch("routers.glossary.load_glossary", return_value=glossary_terms),
            patch("routers.glossary.get_dataset_repository", return_value=repo),
        ):
            examples = glossary.get_term_examples("灵力", book="지존신의", limit=3)

        repo.list_records.assert_called_once_with(book_exact="지존신의")
        self.assertEqual(len(examples), 1)
        self.assertEqual(examples[0]["matched_in"], "both")
        self.assertIn("신력", examples[0]["ko_snippet"])

    def test_get_term_examples_uses_global_glossary_term_when_book_not_provided(self):
        repo = Mock()
        repo.list_records.return_value = [
            {
                "id": "record-2",
                "book": "교술",
                "chapter_ko": 2,
                "chapter_zh": "2",
                "status": "confirmed",
                "zh_text": "灵台가 흔들렸다.",
                "ko_text_confirmed": "영대가 흔들렸다.",
            }
        ]

        with (
            patch(
                "routers.glossary.load_glossary",
                return_value=[{"term_zh": "灵台", "term_ko": "영대", "term_meaning_ko": "영대", "book": "", "domain": "", "policy": "고정"}],
            ),
            patch("routers.glossary.get_dataset_repository", return_value=repo),
        ):
            examples = glossary.get_term_examples("灵台")

        repo.list_records.assert_called_once_with()
        self.assertEqual(len(examples), 1)
        self.assertEqual(examples[0]["matched_in"], "both")

    def test_get_term_examples_rejects_blank_term(self):
        with self.assertRaises(glossary.HTTPException) as ctx:
            glossary.get_term_examples("   ")

        self.assertEqual(ctx.exception.status_code, 400)

    def test_get_term_examples_surfaces_backend_unavailable_as_503(self):
        with (
            patch("routers.glossary.load_glossary", return_value=[]),
            patch(
                "routers.glossary.get_dataset_repository",
                side_effect=DatasetBackendUnavailableError("dataset backend unavailable"),
            ),
        ):
            with self.assertRaises(glossary.HTTPException) as ctx:
                glossary.get_term_examples("灵力")

        self.assertEqual(ctx.exception.status_code, 503)

    def test_get_term_examples_returns_term_sentence_with_prev_and_next_context(self):
        repo = Mock()
        repo.list_records.return_value = [
            {
                "id": "record-3",
                "book": "지존신의",
                "chapter_ko": 3,
                "chapter_zh": "3",
                "status": "confirmed",
                "zh_text": "前文一句。灵力突然爆发。后文一句。尾句一句。",
                "ko_text_confirmed": "앞문장 하나. 영력이 갑자기 폭발했다. 뒷문장 하나. 끝문장 하나.",
            }
        ]

        with (
            patch(
                "routers.glossary.load_glossary",
                return_value=[{"term_zh": "灵力", "term_ko": "영력", "term_meaning_ko": "영력", "book": "", "domain": "", "policy": "고정"}],
            ),
            patch("routers.glossary.get_dataset_repository", return_value=repo),
        ):
            examples = glossary.get_term_examples("灵力", limit=1)

        self.assertEqual(len(examples), 1)
        self.assertEqual(
            examples[0]["zh_snippet"],
            "前文一句。\n灵力突然爆发。\n后文一句。",
        )
        self.assertEqual(
            examples[0]["ko_snippet"],
            "앞문장 하나.\n영력이 갑자기 폭발했다.\n뒷문장 하나.",
        )


if __name__ == "__main__":
    unittest.main()
