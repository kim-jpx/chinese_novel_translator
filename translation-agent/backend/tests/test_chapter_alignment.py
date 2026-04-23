import unittest

from backend.storage.chapter_alignment import align_ko_chapters_by_zh


def _cleaner(text: str, _language: str) -> str:
    return text.strip()


def _identity_splitter(_zh_text: str, ko_text: str) -> tuple[str, str, str]:
    return "", ko_text.strip(), ""


class ChapterAlignmentTests(unittest.TestCase):
    def test_global_alignment_redistributes_ko_pool_by_source_lengths(self):
        records = [
            {
                "id": "r1",
                "book": "지존신의",
                "chapter_ko": 1,
                "chapter_zh": "1",
                "zh_text": "甲" * 10,
                "ko_text": "ko-a1\nko-a2\nko-a3",
            },
            {
                "id": "r2",
                "book": "지존신의",
                "chapter_ko": 2,
                "chapter_zh": "2",
                "zh_text": "乙" * 30,
                "ko_text": "ko-b1",
            },
        ]

        decisions = align_ko_chapters_by_zh(
            records,
            cleaner=_cleaner,
            splitter=_identity_splitter,
            aligner=None,
            window_padding_units=0,
        )

        self.assertEqual(len(decisions), 2)
        self.assertEqual(decisions[0].proposed_ko_text, "ko-a1")
        self.assertEqual(decisions[1].proposed_ko_text, "ko-a2\nko-a3\nko-b1")
        self.assertTrue(decisions[0].auto_applied)
        self.assertTrue(decisions[1].auto_applied)

    def test_global_alignment_rebalances_even_when_existing_split_is_skewed(self):
        records = [
            {
                "id": "r1",
                "book": "교술",
                "chapter_ko": 1,
                "chapter_zh": "1",
                "zh_text": "甲" * 20,
                "ko_text": "k1\nk2\nk3",
            },
            {
                "id": "r2",
                "book": "교술",
                "chapter_ko": 2,
                "chapter_zh": "2",
                "zh_text": "乙" * 20,
                "ko_text": "k4",
            },
        ]

        decisions = align_ko_chapters_by_zh(
            records,
            cleaner=_cleaner,
            splitter=_identity_splitter,
            aligner=None,
            window_padding_units=0,
        )

        self.assertEqual([decision.proposed_ko_text for decision in decisions], ["k1\nk2", "k3\nk4"])


if __name__ == "__main__":
    unittest.main()
