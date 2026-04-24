import unittest

from backend.storage.translation_memory import (
    build_glossary_hits,
    build_prompt_glossary_table,
    build_prompt_reference_examples,
    build_reference_examples,
    get_confirmed_records,
    resolve_previous_record_id,
)


class TranslationMemoryTests(unittest.TestCase):
    def test_get_confirmed_records_filters_parallel_rows(self):
        records = [
            {
                "id": "draft-1",
                "status": "draft",
                "zh_text": "中文",
                "ko_text": "번역",
                "chapter_ko": 1,
            },
            {
                "id": "confirmed-1",
                "status": "confirmed",
                "zh_text": "中文 원문",
                "ko_text_confirmed": "확정 번역",
                "chapter_ko": 2,
            },
            {
                "id": "confirmed-missing-ko",
                "status": "confirmed",
                "zh_text": "中文 원문",
                "ko_text_confirmed": "",
                "ko_text": "",
                "chapter_ko": 3,
            },
        ]

        confirmed = get_confirmed_records(records)
        self.assertEqual([record["id"] for record in confirmed], ["confirmed-1"])

    def test_build_glossary_hits_prioritizes_book_scope(self):
        glossary = [
            {"term_zh": "灵力", "term_ko": "영력", "book": "", "domain": "", "policy": "고정"},
            {"term_zh": "天医阁", "term_ko": "천의각", "book": "지존신의", "domain": "지존신의", "policy": "고정"},
            {"term_zh": "天医", "term_ko": "천의", "book": "", "domain": "", "policy": "검토중"},
        ]

        hits = build_glossary_hits(
            glossary,
            "天医阁의 灵力이 폭주했다",
            book="지존신의",
        )

        self.assertEqual(hits[0]["term_zh"], "天医阁")
        self.assertEqual(hits[0]["scope"], "book")
        self.assertEqual({hit["term_zh"] for hit in hits}, {"天医阁", "灵力", "天医"})

    def test_build_reference_examples_prefers_previous_and_term_matches(self):
        records = [
            {
                "id": "prev",
                "book": "지존신의",
                "chapter_ko": 9,
                "chapter_zh": "9",
                "status": "confirmed",
                "zh_text": "灵力가 흔들리고 天医阁 문이 열렸다.",
                "ko_text_confirmed": "영력이 흔들리고 천의각 문이 열렸다.",
            },
            {
                "id": "term",
                "book": "지존신의",
                "chapter_ko": 10,
                "chapter_zh": "10",
                "status": "confirmed",
                "zh_text": "主角은 灵力를 끌어올렸다.",
                "ko_text_confirmed": "주인공은 영력을 끌어올렸다.",
            },
            {
                "id": "recent",
                "book": "지존신의",
                "chapter_ko": 12,
                "chapter_zh": "12",
                "status": "confirmed",
                "zh_text": "그는 약방으로 향했다.",
                "ko_text_confirmed": "그는 약방으로 향했다.",
            },
        ]
        glossary_hits = [{"term_zh": "灵力", "term_ko": "영력", "scope": "book"}]

        examples = build_reference_examples(
            records,
            "灵力를 다루는 장면이다.",
            glossary_hits,
            prev_record_id="prev",
            limit=3,
        )

        self.assertEqual(examples[0]["record_id"], "prev")
        self.assertEqual(examples[0]["source"], "previous")
        self.assertTrue(any(example["source"] == "term" for example in examples))

    def test_resolve_previous_record_id_uses_current_chapter_ko(self):
        records = [
            {
                "id": "ch9",
                "book": "지존신의",
                "chapter_ko": 9,
                "chapter_zh": "9",
                "status": "confirmed",
                "zh_text": "九",
                "ko_text_confirmed": "구",
            },
            {
                "id": "ch10",
                "book": "지존신의",
                "chapter_ko": 10,
                "chapter_zh": "10",
                "status": "confirmed",
                "zh_text": "十",
                "ko_text_confirmed": "십",
            },
            {
                "id": "ch12",
                "book": "지존신의",
                "chapter_ko": 12,
                "chapter_zh": "12",
                "status": "confirmed",
                "zh_text": "十二",
                "ko_text_confirmed": "십이",
            },
        ]

        previous_record_id = resolve_previous_record_id(
            records,
            current_chapter_ko=11,
            fallback_prev_record_id="ch12",
        )

        self.assertEqual(previous_record_id, "ch10")

    def test_resolve_previous_record_id_falls_back_to_current_chapter_zh(self):
        records = [
            {
                "id": "zh3",
                "book": "지존신의",
                "chapter_ko": 30,
                "chapter_zh": "3",
                "status": "confirmed",
                "zh_text": "三",
                "ko_text_confirmed": "삼",
            },
            {
                "id": "zh5",
                "book": "지존신의",
                "chapter_ko": 50,
                "chapter_zh": "5-6",
                "status": "confirmed",
                "zh_text": "五六",
                "ko_text_confirmed": "오육",
            },
        ]

        previous_record_id = resolve_previous_record_id(
            records,
            current_chapter_zh="7",
        )

        self.assertEqual(previous_record_id, "zh5")

    def test_resolve_previous_record_id_returns_none_when_no_previous_exists(self):
        records = [
            {
                "id": "ch2",
                "book": "지존신의",
                "chapter_ko": 2,
                "chapter_zh": "2",
                "status": "confirmed",
                "zh_text": "二",
                "ko_text_confirmed": "이",
            },
        ]

        previous_record_id = resolve_previous_record_id(
            records,
            current_chapter_ko=1,
            fallback_prev_record_id="ch2",
        )

        self.assertIsNone(previous_record_id)

    def test_prompt_builders_render_human_readable_sections(self):
        glossary_text = build_prompt_glossary_table(
            [{"term_zh": "灵力", "term_ko": "영력", "scope": "book", "policy": "고정", "notes": ""}]
        )
        reference_text = build_prompt_reference_examples(
            [
                {
                    "record_id": "a",
                    "book": "지존신의",
                    "chapter_ko": 1,
                    "chapter_zh": "1",
                    "source": "term",
                    "matched_terms": ["灵力"],
                    "zh_snippet": "灵力가 요동쳤다.",
                    "ko_snippet": "영력이 요동쳤다.",
                }
            ]
        )

        self.assertIn("灵力", glossary_text)
        self.assertIn("영력", glossary_text)
        self.assertIn("[예문 1]", reference_text)
        self.assertIn("matched=灵力", reference_text)


if __name__ == "__main__":
    unittest.main()
