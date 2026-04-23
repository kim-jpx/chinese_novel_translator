import os
import unittest
from unittest.mock import patch
import asyncio
import tempfile
from pathlib import Path

os.environ["DATASET_BACKEND"] = "file"

from backend.storage.alignment_review_store import (
    SQLiteAlignmentReviewStore,
    make_alignment_review_id,
)
from routers import dataset
from routers import upload


class ChapterMatchingTests(unittest.TestCase):
    def test_expand_chapter_zh_range_and_list(self):
        self.assertEqual(dataset.expand_chapter_zh("1,3-4"), [1, 3, 4])

    def test_expand_chapter_zh_ignores_invalid_tokens(self):
        self.assertEqual(dataset.expand_chapter_zh("abc,5-3,2"), [2, 3, 4, 5])

    def test_get_dataset_filters_by_chapter_zh_overlap(self):
        records = [
            {"id": "a", "book": "b1", "chapter_ko": 10, "chapter_zh": "1-2"},
            {"id": "b", "book": "b1", "chapter_ko": 11, "chapter_zh": "3,4"},
            {"id": "c", "book": "b1", "chapter_ko": 12, "chapter_zh": "6"},
        ]
        with patch("routers.dataset.load_dataset", return_value=records):
            filtered = dataset.get_dataset(chapter_zh="2-3")
        self.assertEqual([r["id"] for r in filtered], ["a", "b"])

    def test_get_dataset_falls_back_to_exact_string_when_no_numeric_token(self):
        records = [
            {"id": "a", "book": "b1", "chapter_ko": 10, "chapter_zh": "special"},
            {"id": "b", "book": "b1", "chapter_ko": 11, "chapter_zh": "other"},
        ]
        with patch("routers.dataset.load_dataset", return_value=records):
            filtered = dataset.get_dataset(chapter_zh="special")
        self.assertEqual([r["id"] for r in filtered], ["a"])

    def test_get_dataset_supports_exact_book_match(self):
        records = [
            {"id": "a", "book": "교술", "chapter_ko": 1, "chapter_zh": "1"},
            {"id": "b", "book": "교술 외전", "chapter_ko": 2, "chapter_zh": "2"},
        ]
        with patch("routers.dataset.load_dataset", return_value=records):
            filtered = dataset.get_dataset(book="교술", book_exact="교술")
        self.assertEqual([r["id"] for r in filtered], ["a"])

    def test_get_dataset_filters_by_status(self):
        records = [
            {"id": "a", "book": "교술", "chapter_ko": 1, "chapter_zh": "1", "status": "draft"},
            {"id": "b", "book": "교술", "chapter_ko": 2, "chapter_zh": "2", "status": "confirmed"},
        ]
        with patch("routers.dataset.load_dataset", return_value=records):
            filtered = dataset.get_dataset(status="confirmed")
        self.assertEqual([r["id"] for r in filtered], ["b"])

    def test_merge_records_by_zh_chapter_merges_duplicates(self):
        records = [
            {
                "id": "a",
                "book": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "book_ko": "지존신의",
                "chapter_ko": 1,
                "chapter_zh": "1",
                "zh_text": "中文",
                "ko_text": "",
                "notes": "",
            },
            {
                "id": "b",
                "book": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "book_ko": "지존신의",
                "chapter_ko": 1,
                "chapter_zh": "1",
                "zh_text": "",
                "ko_text": "한국어",
                "notes": "",
            },
        ]
        merged, merged_count, conflict_count = dataset.merge_records_by_zh_chapter(records)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged_count, 1)
        self.assertEqual(conflict_count, 0)
        self.assertEqual(merged[0]["zh_text"], "中文")
        self.assertEqual(merged[0]["ko_text"], "한국어")

    def test_merge_duplicate_records_rejected_for_supabase_backend(self):
        with patch("routers.dataset.get_dataset_backend", return_value="supabase"):
            with self.assertRaises(dataset.HTTPException) as ctx:
                dataset.merge_duplicate_records()

        self.assertEqual(ctx.exception.status_code, 409)

    def test_export_record_requires_confirmed_status_by_default(self):
        record = {
            "id": "draft-1",
            "book": "교술",
            "chapter_ko": 1,
            "chapter_zh": "1",
            "zh_text": "中文",
            "ko_text": "임시 번역",
            "ko_text_confirmed": "",
            "status": "draft",
            "human_reviewed": False,
            "review_note": "",
        }
        repo = unittest.mock.Mock()
        repo.get_record.return_value = record

        with patch("routers.dataset.get_repository", return_value=repo):
            with self.assertRaises(dataset.HTTPException) as ctx:
                dataset.export_record("draft-1")

        self.assertEqual(ctx.exception.status_code, 409)

    def test_export_record_allows_draft_when_explicitly_requested(self):
        record = {
            "id": "draft-1",
            "book": "교술",
            "chapter_ko": 1,
            "chapter_zh": "1",
            "zh_text": "中文",
            "ko_text": "임시 번역",
            "ko_text_confirmed": "",
            "status": "draft",
            "human_reviewed": False,
            "review_note": "",
        }
        repo = unittest.mock.Mock()
        repo.get_record.return_value = record

        with patch("routers.dataset.get_repository", return_value=repo):
            response = dataset.export_record("draft-1", allow_draft=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn("임시 번역", response.body.decode("utf-8"))


class UploadMappingDirectionTests(unittest.TestCase):
    def test_upload_upserts_by_book_and_chapter_zh(self):
        saved_snapshots = []
        current_records = []

        def capture_save(records):
            current_records[:] = list(records)
            saved_snapshots.append(list(records))

        def load_current_records(*, book=None, chapter_ko=None, chapter_zh=None):
            records = list(current_records)
            if book:
                records = [record for record in records if book.lower() in str(record.get("book", "")).lower()]
            if chapter_ko is not None:
                records = [record for record in records if int(record.get("chapter_ko", -1) or -1) == chapter_ko]
            if chapter_zh:
                records = [record for record in records if str(record.get("chapter_zh", "")).strip() == chapter_zh.strip()]
            return records

        with (
            patch("routers.upload.load_dataset", side_effect=load_current_records),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            asyncio.run(
                upload._process_upload(
                    ko_text="这是中文原文",
                    book="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1",
                    chapter_zh="1",
                    input_language="zh",
                    is_original_text=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )
            result = asyncio.run(
                upload._process_upload(
                    ko_text="한국어 번역문",
                    book="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1",
                    chapter_zh="1",
                    input_language="ko",
                    is_original_text=False,
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )

        self.assertEqual(result.upserted_count, 1)
        self.assertEqual(result.merged_count, 1)
        self.assertEqual(len(saved_snapshots[-1]), 1)
        record = saved_snapshots[-1][0]
        self.assertEqual(record["zh_text"], "这是中文原文")
        self.assertEqual(record["ko_text"], "한국어 번역문")

    def test_upload_reports_conflicts_for_existing_translation_text(self):
        saved_snapshots = []
        current_records = [
            {
                "id": "existing-1",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 1,
                "chapter_ko": 1,
                "chapter_zh": "1",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "zh-CN",
                "target_lang": "ko-KR",
                "zh_text": "这是中文原文",
                "ko_text": "기존 번역문",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            }
        ]

        def capture_save(records):
            current_records[:] = list(records)
            saved_snapshots.append(list(records))

        def load_current_records(*, book=None, chapter_ko=None, chapter_zh=None):
            records = list(current_records)
            if book:
                records = [record for record in records if book.lower() in str(record.get("book", "")).lower()]
            if chapter_ko is not None:
                records = [record for record in records if int(record.get("chapter_ko", -1) or -1) == chapter_ko]
            if chapter_zh:
                records = [record for record in records if str(record.get("chapter_zh", "")).strip() == chapter_zh.strip()]
            return records

        with (
            patch("routers.upload.load_dataset", side_effect=load_current_records),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="새 번역문",
                    book="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1",
                    chapter_zh="1",
                    input_language="ko",
                    is_original_text=False,
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )

        self.assertEqual(result.status, "conflict_pending")
        self.assertEqual(result.upserted_count, 1)
        self.assertEqual(result.conflict_count, 1)
        self.assertEqual(result.conflicts[0].field, "ko_text")
        self.assertEqual(result.conflicts[0].existing_value, "기존 번역문")
        self.assertEqual(result.conflicts[0].incoming_value, "새 번역문")
        self.assertEqual(saved_snapshots[-1][0]["ko_text"], "기존 번역문")

    def test_upload_stores_zh_original_text_into_zh_text(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value="fetched external text"),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="这是上传的中文原文",
                    book="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1",
                    chapter_zh="1",
                    input_language="zh",
                    is_original_text=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertTrue(result.zh_fetched)
        record = saved_snapshots[-1][-1]
        self.assertEqual(record["zh_text"], "这是上传的中文原文")
        self.assertEqual(record["ko_text"], "")

    def test_upload_single_zh_original_keeps_body_when_heading_repeats(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        repeated_heading_text = "\n".join(
            [
                "第4章 火光",
                "  第4章 火光",
                "",
                "慕清澜缓缓抬眸。",
                "她看向门外的夜色。",
            ]
        )

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text=repeated_heading_text,
                    book="역천신비지상",
                    book_zh="逆天神妃至上",
                    chapter="4",
                    chapter_zh="4",
                    input_language="zh",
                    is_original_text=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertTrue(result.zh_fetched)
        record = saved_snapshots[-1][-1]
        self.assertEqual(record["zh_text"], "慕清澜缓缓抬眸。\n她看向门外的夜色。")
        self.assertEqual(record["ko_text"], "")

    def test_upload_zh_range_ignores_duplicate_internal_chapter_headings(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        text = "\n".join(
            [
                "1화 | 第1章 陨落的天才",
                "第1章 陨落的天才",
                "  第1章 陨落的天才",
                "第一章正文。",
                "2화 | 第2章 黑色玉简",
                "第2章 黑色玉简",
                "  第2章 黑色玉简",
                "第二章正文。",
            ]
        )

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text=text,
                    book="역천신비지상",
                    book_zh="逆天神妃至上",
                    chapter="1-2",
                    chapter_zh="1-2",
                    input_language="zh",
                    is_original_text=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.created_count, 2)
        records = saved_snapshots[-1]
        self.assertEqual(records[0]["zh_text"], "第一章正文。")
        self.assertEqual(records[1]["zh_text"], "第二章正文。")

    def test_upload_text_can_store_provided_source_zh_with_ko_translation(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.align_parallel_segments", side_effect=lambda zh, ko: (zh, ko)),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="한국어 번역 초안",
                    source_zh_text="这是中文原文",
                    book_ko="테스트작",
                    book_zh="测试作品",
                    chapter="1",
                    chapter_zh="1",
                    input_language="ko",
                    is_original_text=False,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertTrue(result.zh_fetched)
        record = saved_snapshots[-1][-1]
        self.assertEqual(record["zh_text"], "这是中文原文")
        self.assertEqual(record["ko_text"], "한국어 번역 초안")
        self.assertEqual(record["book_ko"], "테스트작")
        self.assertEqual(record["book_zh"], "测试作品")

    def test_upload_resolves_supported_book_from_korean_alias(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="한국어 번역문",
                    book="지존신의",
                    chapter="1",
                    chapter_zh="1",
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.source_fetch_mode, "metadata_only")
        record = saved_snapshots[-1][-1]
        self.assertEqual(record["book_ko"], "지존신의")
        self.assertEqual(record["book_zh"], "至尊神医之帝君要下嫁")
        self.assertEqual(record["genre"], ["현대판타지", "신의/의술", "환생", "무협요소"])
        self.assertIn("bid=9015656", record["source_url"])

    def test_update_book_title_updates_all_matching_records(self):
        class FakeRepo:
            def __init__(self):
                self.records = [
                    {
                        "id": "a",
                        "book": "old",
                        "book_ko": "old",
                        "book_zh": "",
                        "chapter_ko": 1,
                        "chapter_zh": "1",
                        "zh_text": "",
                        "ko_text": "번역 1",
                    },
                    {
                        "id": "b",
                        "book": "old",
                        "book_ko": "old",
                        "book_zh": "",
                        "chapter_ko": 2,
                        "chapter_zh": "2",
                        "zh_text": "",
                        "ko_text": "번역 2",
                    },
                ]

            def list_records(self, **kwargs):
                return [dict(record) for record in self.records]

            def update_record(self, record_id, record):
                for index, current in enumerate(self.records):
                    if current["id"] == record_id:
                        self.records[index] = dict(record)
                        return dict(record)
                raise AssertionError(record_id)

        repo = FakeRepo()
        with patch("routers.dataset.get_repository", return_value=repo):
            result = dataset.update_book_title(
                dataset.BookTitleUpdateRequest(
                    current_book="old",
                    book_ko="새 제목",
                    book_zh="新标题",
                )
            )

        self.assertEqual(result.updated_count, 2)
        self.assertEqual({record["book"] for record in repo.records}, {"새 제목"})
        self.assertEqual({record["book_ko"] for record in repo.records}, {"새 제목"})
        self.assertEqual({record["book_zh"] for record in repo.records}, {"新标题"})

    def test_update_book_title_rejects_canonical_pair_conflict(self):
        class FakeRepo:
            def __init__(self):
                self.records = [
                    {
                        "id": "target",
                        "book": "old",
                        "book_ko": "old",
                        "book_zh": "",
                        "chapter_ko": 1,
                        "chapter_zh": "1",
                        "zh_text": "",
                        "ko_text": "번역",
                    },
                    {
                        "id": "other",
                        "book": "other",
                        "book_ko": "새 제목",
                        "book_zh": "新标题",
                        "chapter_ko": 1,
                        "chapter_zh": "1",
                        "zh_text": "",
                        "ko_text": "다른 번역",
                    },
                ]

            def list_records(self, **kwargs):
                return [dict(record) for record in self.records]

            def update_record(self, record_id, record):
                raise AssertionError("update_record should not be called on conflict")

        with patch("routers.dataset.get_repository", return_value=FakeRepo()):
            with self.assertRaises(dataset.HTTPException) as ctx:
                dataset.update_book_title(
                    dataset.BookTitleUpdateRequest(
                        current_book="old",
                        book_ko="새 제목",
                        book_zh="新标题",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 409)

    def test_upload_rejects_ko_original_mode(self):
        with self.assertRaises(upload.HTTPException) as ctx:
            asyncio.run(
                upload._process_upload(
                    ko_text="한국어 텍스트",
                    book="교술",
                    chapter="1",
                    chapter_zh="1",
                    input_language="ko",
                    is_original_text=True,
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("input_language=zh", str(ctx.exception.detail))

    def test_upload_accepts_chapter_zh_only_when_chapter_empty(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="단일 텍스트",
                    book="교술",
                    chapter="",
                    chapter_zh="7",
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.created_count, 1)
        record = saved_snapshots[-1][-1]
        self.assertEqual(record["chapter_ko"], 7)
        self.assertEqual(record["chapter_zh"], "7")

    def test_upload_splits_range_preserves_chapter_ko_when_zh_to_ko(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        text = "1화\n첫번째 내용\n2화\n두번째 내용\n3화\n세번째 내용"
        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value="zh content"),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text=text,
                    book="庶女明兰传",
                    chapter="10-12",
                    chapter_zh="1-3",
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.created_count, 3)
        self.assertEqual(result.status, "added_multi")
        self.assertTrue(saved_snapshots)
        records = saved_snapshots[-1]
        self.assertEqual([r["chapter_ko"] for r in records], [10, 11, 12])
        self.assertEqual([r["chapter_zh"] for r in records], ["1", "2", "3"])
        self.assertIn("/178221.html", records[0]["source_url"])
        self.assertIn("첫번째 내용", records[0]["ko_text"])
        self.assertIn("두번째 내용", records[1]["ko_text"])
        self.assertIn("세번째 내용", records[2]["ko_text"])

    def test_upload_splits_range_and_uses_ko_for_source_when_ko_to_zh(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        text = "1화\n첫번째 내용\n2화\n두번째 내용"
        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value="zh content"),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text=text,
                    book="庶女明兰传",
                    chapter="10-11",
                    chapter_zh="3-4",
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )

        self.assertEqual(result.created_count, 2)
        records = saved_snapshots[-1]
        self.assertEqual([r["chapter_ko"] for r in records], [10, 11])
        self.assertEqual([r["chapter_zh"] for r in records], ["3", "4"])
        self.assertIn("/178230.html", records[0]["source_url"])
        self.assertIn("/178231.html", records[1]["source_url"])

    def test_upload_rejects_when_range_count_and_text_segments_do_not_match(self):
        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset"),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value="zh content"),
        ):
            with self.assertRaises(upload.HTTPException) as ctx:
                asyncio.run(
                    upload._process_upload(
                        ko_text="1화\n첫번째만 있음",
                        book="庶女明兰传",
                        chapter="1-2",
                        chapter_zh="1-2",
                        mapping_direction="ko_to_zh",
                        script="unknown",
                    )
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("분할 개수", str(ctx.exception.detail))

    def test_upload_record_id_prefix_differs_for_non_ascii_book_names(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", return_value=""),
        ):
            asyncio.run(
                upload._process_upload(
                    ko_text="단일 텍스트",
                    book="교술",
                    chapter="1",
                    chapter_zh="1",
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )
            first_id = saved_snapshots[-1][-1]["id"]

            asyncio.run(
                upload._process_upload(
                    ko_text="단일 텍스트",
                    book="지존신의",
                    chapter="1",
                    chapter_zh="1",
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )
            second_id = saved_snapshots[-1][-1]["id"]

        self.assertNotEqual(first_id, second_id)
        self.assertTrue(first_id.startswith("book_"))
        self.assertTrue(second_id.startswith("book_"))

    def test_upload_aggregates_zh_fetch_flags_for_multi_chapter(self):
        saved_snapshots = []

        def capture_save(records):
            saved_snapshots.append(list(records))

        text = "1화\n첫번째 내용\n2화\n두번째 내용"
        with (
            patch("routers.upload.load_dataset", return_value=[]),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.fetch_zh_shuzhaige", side_effect=["원문", ""]),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text=text,
                    book="庶女明兰传",
                    chapter="1-2",
                    chapter_zh="1-2",
                    mapping_direction="ko_to_zh",
                    script="unknown",
                )
            )

        self.assertTrue(result.zh_fetched)
        self.assertTrue(result.zh_fetched_any)
        self.assertFalse(result.zh_fetched_all)

    def test_promote_candidates_adds_new_terms_to_glossary(self):
        records = [{
            "book": "지존신의",
            "chapter_ko": 1,
            "new_term_candidates": ["神医", "帝君"],
        }]
        with tempfile.TemporaryDirectory() as tmp:
            glossary_path = Path(tmp) / "glossary.json"
            glossary_path.write_text("[]", encoding="utf-8")
            with (
                patch("routers.upload.load_dataset", return_value=records),
                patch("backend.storage.glossary_store.get_glossary_path", return_value=glossary_path),
                patch("backend.storage.glossary_store.get_root_glossary_path", return_value=glossary_path),
            ):
                res = upload.promote_candidates(upload.PromoteCandidatesRequest(book="지존신의"))
            self.assertEqual(res["added"], 2)
            glossary = glossary_path.read_text(encoding="utf-8")
            self.assertIn("神医", glossary)
            self.assertIn("帝君", glossary)

    def test_promote_candidates_infers_term_ko_from_selected_records(self):
        records = [{
            "book": "지존신의",
            "book_ko": "지존신의",
            "book_zh": "至尊神医之帝君要下嫁",
            "chapter_ko": 1,
            "zh_text": "她是天令皇朝的帝姬。",
            "ko_text": "그녀는 천령황조(天令皇朝)의 제희였다.",
            "new_term_candidates": ["天令皇朝"],
        }]
        with tempfile.TemporaryDirectory() as tmp:
            glossary_path = Path(tmp) / "glossary.json"
            glossary_path.write_text("[]", encoding="utf-8")
            with (
                patch("routers.upload.load_dataset", return_value=records),
                patch("backend.storage.glossary_store.get_glossary_path", return_value=glossary_path),
                patch("backend.storage.glossary_store.get_root_glossary_path", return_value=glossary_path),
            ):
                res = upload.promote_candidates(upload.PromoteCandidatesRequest(book="지존신의"))

            self.assertEqual(res["added"], 1)
            self.assertEqual(res["meaning_updated"], 1)
            glossary = glossary_path.read_text(encoding="utf-8")
            self.assertIn('"term_zh": "天令皇朝"', glossary)
            self.assertIn('"term_ko": "천령황조"', glossary)
            self.assertIn('"term_meaning_ko": "천령황조"', glossary)
            self.assertIn("예문 병기 자동 추정", glossary)
            self.assertIn("원문 뜻 자동 추정", glossary)

    def test_promote_candidates_refreshes_missing_term_meanings_for_existing_terms(self):
        records = [{
            "book": "지존신의",
            "book_ko": "지존신의",
            "book_zh": "至尊神医之帝君要下嫁",
            "chapter_ko": 1,
            "zh_text": "她是天令皇朝的帝姬。",
            "ko_text": "그녀는 천령황조(天令皇朝)의 제희였다.",
            "new_term_candidates": ["天令皇朝"],
        }]
        with tempfile.TemporaryDirectory() as tmp:
            glossary_path = Path(tmp) / "glossary.json"
            glossary_path.write_text(
                '[{"term_zh":"天令皇朝","term_ko":"","pos":"미분류","domain":"지존신의","policy":"검토중","notes":"업로드 후보 자동 승격","book":"지존신의"}]',
                encoding="utf-8",
            )
            with (
                patch("routers.upload.load_dataset", return_value=records),
                patch("backend.storage.glossary_store.get_glossary_path", return_value=glossary_path),
                patch("backend.storage.glossary_store.get_root_glossary_path", return_value=glossary_path),
            ):
                res = upload.promote_candidates(upload.PromoteCandidatesRequest(book="지존신의"))

            self.assertEqual(res["added"], 0)
            self.assertEqual(res["meaning_updated"], 1)
            glossary = glossary_path.read_text(encoding="utf-8")
            self.assertIn('"term_ko": "천령황조"', glossary)
            self.assertIn('"term_meaning_ko": "천령황조"', glossary)
            self.assertIn("예문 병기 자동 추정", glossary)
            self.assertIn("원문 뜻 자동 추정", glossary)

    def test_upload_resegments_existing_ko_when_zh_uploaded_with_option(self):
        base_records = [
            {
                "id": "r1",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 1,
                "chapter_ko": 1,
                "chapter_zh": "1",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "ko-KR",
                "target_lang": "zh-CN",
                "zh_text": "",
                "ko_text": "기존 한국어 1",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            },
            {
                "id": "r2",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 2,
                "chapter_ko": 2,
                "chapter_zh": "2",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "ko-KR",
                "target_lang": "zh-CN",
                "zh_text": "",
                "ko_text": "기존 한국어 2",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            },
        ]
        saved_snapshots = []

        def load_records(*args, **kwargs):
            return base_records

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", side_effect=load_records),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.align_parallel_segments", side_effect=lambda zh, ko: (zh, ko)),
            patch(
                "routers.upload.split_ko_with_overflow_by_zh",
                side_effect=[("", "재분할 한국어 1", "재분할 한국어 2"), ("", "재분할 한국어 2", "")],
            ),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="第1章\n중국어 원문 1\n第2章\n중국어 원문 2",
                    book="지존신의",
                    book_ko="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1-2",
                    chapter_zh="1-2",
                    input_language="zh",
                    is_original_text=True,
                    resegment_ko_by_zh=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.upserted_count, 2)
        self.assertTrue(saved_snapshots)
        by_ch = {str(r["chapter_zh"]): r for r in saved_snapshots[-1]}
        self.assertEqual(by_ch["1"]["zh_text"], "중국어 원문 1")
        self.assertEqual(by_ch["2"]["zh_text"], "중국어 원문 2")
        self.assertEqual(by_ch["1"]["ko_text"], "재분할 한국어 1")
        self.assertEqual(by_ch["2"]["ko_text"], "재분할 한국어 2")

    def test_upload_does_not_resegment_existing_ko_when_option_disabled(self):
        base_records = [
            {
                "id": "r1",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 1,
                "chapter_ko": 1,
                "chapter_zh": "1",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "ko-KR",
                "target_lang": "zh-CN",
                "zh_text": "",
                "ko_text": "기존 한국어 1",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            },
            {
                "id": "r2",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 2,
                "chapter_ko": 2,
                "chapter_zh": "2",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "ko-KR",
                "target_lang": "zh-CN",
                "zh_text": "",
                "ko_text": "기존 한국어 2",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            },
        ]
        saved_snapshots = []

        with (
            patch("routers.upload.load_dataset", side_effect=lambda *args, **kwargs: base_records),
            patch("routers.upload.save_dataset", side_effect=lambda records: saved_snapshots.append(list(records))),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.align_parallel_segments", side_effect=lambda zh, ko: (zh, ko)),
            patch("routers.upload.split_ko_with_overflow_by_zh") as split_mock,
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="第1章\n중국어 원문 1\n第2章\n중국어 원문 2",
                    book="지존신의",
                    book_ko="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1-2",
                    chapter_zh="1-2",
                    input_language="zh",
                    is_original_text=True,
                    resegment_ko_by_zh=False,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.upserted_count, 2)
        split_mock.assert_not_called()
        by_ch = {str(r["chapter_zh"]): r for r in saved_snapshots[-1]}
        self.assertEqual(by_ch["1"]["ko_text"], "기존 한국어 1")
        self.assertEqual(by_ch["2"]["ko_text"], "기존 한국어 2")

    def test_upload_ko_range_then_zh_upload_resegments_by_zh(self):
        records_state = []
        saved_snapshots = []

        def load_records(*args, **kwargs):
            return records_state

        def save_records(records):
            saved_snapshots.append(list(records))
            records_state.clear()
            records_state.extend(list(records))

        split_side_effect = [
            ("", "ko-zh1", "ko-zh2"),   # ko range upload i=0
            ("", "ko-zh2", ""),         # ko range upload i=1
            ("", "ko-zh1-fixed", "ko-zh2-fixed"),  # zh upload resegment i=0
            ("", "ko-zh2-fixed", ""),             # zh upload resegment i=1
        ]
        with (
            patch("routers.upload.load_dataset", side_effect=load_records),
            patch("routers.upload.save_dataset", side_effect=save_records),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.align_parallel_segments", side_effect=lambda zh, ko: (zh, ko)),
            patch(
                "routers.upload.split_ko_with_overflow_by_zh",
                side_effect=split_side_effect,
            ),
        ):
            asyncio.run(
                upload._process_upload(
                    ko_text="1화\nko raw 1\n2화\nko raw 2",
                    book="지존신의",
                    book_ko="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1-2",
                    chapter_zh="1-2",
                    input_language="ko",
                    is_original_text=False,
                    resegment_ko_by_zh=False,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

            result = asyncio.run(
                upload._process_upload(
                    ko_text="第1章\nzh raw 1\n第2章\nzh raw 2",
                    book="지존신의",
                    book_ko="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1-2",
                    chapter_zh="1-2",
                    input_language="zh",
                    is_original_text=True,
                    resegment_ko_by_zh=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.created_count, 2)
        self.assertTrue(saved_snapshots)
        latest_zh_texts = [r.get("zh_text", "") for r in saved_snapshots[-1]]
        self.assertTrue(any("zh raw" in value for value in latest_zh_texts))

    def test_upload_ko_first_then_zh_resegment_maps_exact_by_chapter_zh(self):
        # KO-first 상태(zh_text 없음, ko_text만 있음)를 만들고,
        # 이후 ZH 업로드 + resegment 옵션으로 chapter_zh별 KO 재배치를 검증한다.
        base_records = [
            {
                "id": "ko_first_1",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 1,
                "chapter_ko": 1,
                "chapter_zh": "1",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "ko-KR",
                "target_lang": "zh-CN",
                "zh_text": "",
                "ko_text": "ko-first-ch1",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            },
            {
                "id": "ko_first_2",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 2,
                "chapter_ko": 2,
                "chapter_zh": "2",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "ko-KR",
                "target_lang": "zh-CN",
                "zh_text": "",
                "ko_text": "ko-first-ch2",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            },
        ]
        saved_snapshots = []

        def fake_split_by_zh(zh_text: str, ko_text: str):
            if "zh-target-1" in zh_text:
                return "", "ko-remapped-1", "ko-remapped-2"
            if "zh-target-2" in zh_text:
                return "", "ko-remapped-2", ""
            return "", ko_text, ""

        with (
            patch("routers.upload.load_dataset", side_effect=lambda *args, **kwargs: base_records),
            patch("routers.upload.save_dataset", side_effect=lambda records: saved_snapshots.append(list(records))),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.align_parallel_segments", side_effect=lambda zh, ko: (zh, ko)),
            patch("routers.upload.split_ko_with_overflow_by_zh", side_effect=fake_split_by_zh),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="第1章\nzh-target-1\n第2章\nzh-target-2",
                    book="지존신의",
                    book_ko="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1-2",
                    chapter_zh="1-2",
                    input_language="zh",
                    is_original_text=True,
                    resegment_ko_by_zh=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.upserted_count, 2)
        self.assertTrue(saved_snapshots)
        latest = saved_snapshots[-1]
        by_ch = {str(r.get("chapter_zh", "")): r for r in latest}
        self.assertEqual(by_ch["1"]["zh_text"], "zh-target-1")
        self.assertEqual(by_ch["2"]["zh_text"], "zh-target-2")
        self.assertEqual(by_ch["1"]["ko_text"], "ko-remapped-1")
        self.assertEqual(by_ch["2"]["ko_text"], "ko-remapped-2")

    def test_upload_resegment_returns_alignment_review_for_low_confidence_boundary(self):
        base_records = [
            {
                "id": "review-1",
                "book": "지존신의",
                "book_ko": "지존신의",
                "book_zh": "至尊神医之帝君要下嫁",
                "chapter": 1,
                "chapter_ko": 1,
                "chapter_zh": "1",
                "script": "unknown",
                "chapter_id": "",
                "chapter_title_zh": "",
                "genre": [],
                "source_url": "",
                "source_lang": "zh-CN",
                "target_lang": "ko-KR",
                "zh_text": "",
                "ko_text": "기존 번역 그대로 유지",
                "ko_text_confirmed": "",
                "translation_mode": "문학 번역",
                "register": "",
                "era_profile": "ancient",
                "status": "draft",
                "human_reviewed": False,
                "review_note": "",
                "new_term_candidates": [],
                "notes": "",
                "updated_at": "",
            }
        ]
        saved_snapshots = []

        def load_records(*args, **kwargs):
            return base_records

        def capture_save(records):
            saved_snapshots.append(list(records))

        with (
            patch("routers.upload.load_dataset", side_effect=load_records),
            patch("routers.upload.save_dataset", side_effect=capture_save),
            patch("routers.upload.extract_new_terms", return_value=[]),
            patch("routers.upload.align_parallel_segments", side_effect=lambda zh, ko: (zh, ko)),
            patch(
                "routers.upload.split_ko_with_overflow_by_zh",
                return_value=("이전 화 내용", "재분할 제안 번역", ""),
            ),
        ):
            result = asyncio.run(
                upload._process_upload(
                    ko_text="第1章\nzh-review-target",
                    book="지존신의",
                    book_ko="지존신의",
                    book_zh="至尊神医之帝君要下嫁",
                    chapter="1",
                    chapter_zh="1",
                    input_language="zh",
                    is_original_text=True,
                    resegment_ko_by_zh=True,
                    mapping_direction="zh_to_ko",
                    script="unknown",
                )
            )

        self.assertEqual(result.status, "alignment_review_needed")
        self.assertEqual(result.alignment_applied_count, 0)
        self.assertEqual(result.alignment_review_count, 1)
        self.assertEqual(len(result.alignment_reviews), 1)
        self.assertIn("leading_overflow", result.alignment_reviews[0].warnings)
        self.assertTrue(saved_snapshots)
        self.assertEqual(saved_snapshots[-1][0]["ko_text"], "기존 번역 그대로 유지")

    def test_adjust_alignment_review_boundary_moves_last_unit_to_next_review(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            store = SQLiteAlignmentReviewStore(Path(tmpdir) / "alignment.sqlite3")
            first_id = make_alignment_review_id("record-1", "1")
            second_id = make_alignment_review_id("record-2", "2")
            store.upsert_review(
                {
                    "review_id": first_id,
                    "record_id": "record-1",
                    "book": "지존신의",
                    "chapter_ko": 1,
                    "chapter_zh": "1",
                    "existing_ko_text": "기존1",
                    "proposed_ko_text": "첫문단\n둘째문단",
                    "confidence": 0.6,
                    "warnings": [],
                    "status": "pending",
                }
            )
            store.upsert_review(
                {
                    "review_id": second_id,
                    "record_id": "record-2",
                    "book": "지존신의",
                    "chapter_ko": 2,
                    "chapter_zh": "2",
                    "existing_ko_text": "기존2",
                    "proposed_ko_text": "셋째문단\n넷째문단",
                    "confidence": 0.7,
                    "warnings": [],
                    "status": "pending",
                }
            )

            with patch("routers.upload.ALIGNMENT_REVIEW_STORE", store):
                updated = upload.adjust_alignment_review_boundary(
                    first_id,
                    upload.AlignmentReviewBoundaryAdjustRequest(direction="send_end_to_next"),
                )

        updated_by_id = {review.review_id: review for review in updated}
        self.assertEqual(updated_by_id[first_id].proposed_ko_text, "첫문단")
        self.assertEqual(updated_by_id[second_id].proposed_ko_text, "둘째문단\n셋째문단\n넷째문단")

    def test_update_alignment_review_rejects_blank_proposal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            store = SQLiteAlignmentReviewStore(Path(tmpdir) / "alignment.sqlite3")
            review_id = make_alignment_review_id("record-1", "1")
            store.upsert_review(
                {
                    "review_id": review_id,
                    "record_id": "record-1",
                    "book": "지존신의",
                    "chapter_ko": 1,
                    "chapter_zh": "1",
                    "existing_ko_text": "기존1",
                    "proposed_ko_text": "첫문단",
                    "confidence": 0.6,
                    "warnings": [],
                    "status": "pending",
                }
            )

            with patch("routers.upload.ALIGNMENT_REVIEW_STORE", store):
                with self.assertRaises(upload.HTTPException) as ctx:
                    upload.update_alignment_review(
                        review_id,
                        upload.AlignmentReviewUpdateRequest(proposed_ko_text="   "),
                    )

        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
