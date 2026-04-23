import unittest

from backend.routers.translate import (
    build_local_syntax_alignment,
    _normalize_sentence_alignment_rows,
    _normalize_syntax_alignment_pairs,
)


class SyntaxAlignmentTests(unittest.TestCase):
    def test_local_alignment_keeps_unmatched_translation_heading_separate(self):
        pairs = build_local_syntax_alignment(
            "圣元帝国，\n帝都天陵，\n慕家。",
            "## 제 1장 추락한 천재\n찬란한 성원제국의 수도 천릉, 그곳의 모가.",
        )

        self.assertEqual(pairs[0].source, "")
        self.assertEqual(pairs[0].translation, "## 제 1장 추락한 천재")
        self.assertEqual([pair.source for pair in pairs[1:]], ["圣元帝国，", "帝都", "天陵，", "慕家。"])
        self.assertEqual(
            [pair.translation for pair in pairs[1:]],
            ["찬란한 성원제국의", "수도 천릉,", "그곳의", "모가."],
        )

    def test_local_alignment_matches_comma_level_units(self):
        pairs = build_local_syntax_alignment(
            "圣元帝国，\n帝都天陵，\n慕家。",
            "## 제 1장 추락한 천재\n성원제국, 제도 천릉, 모가.",
        )

        self.assertEqual(
            [(pair.source, pair.translation) for pair in pairs],
            [
                ("", "## 제 1장 추락한 천재"),
                ("圣元帝国，", "성원제국,"),
                ("帝都", "제도"),
                ("天陵，", "천릉,"),
                ("慕家。", "모가."),
            ],
        )

    def test_local_alignment_leaves_missing_translation_blank(self):
        pairs = build_local_syntax_alignment(
            "甲。\n乙。\n丙。",
            "갑.\n을.",
        )

        self.assertEqual([pair.source for pair in pairs], ["甲。", "乙。", "丙。"])
        self.assertEqual([pair.translation for pair in pairs], ["갑.", "을.", ""])

    def test_local_alignment_does_not_shift_after_merged_translation_sentence(self):
        pairs = build_local_syntax_alignment(
            "而平时只有遇到重大事情才会开启的议事堂，此时却是灯火通明。\n"
            "慕家的长老，此时竟是几乎尽在此处，脸上神色皆是十分凝重。",
            "평소 중대한 일이 있을 때만 열리던 의사당에 이 시각 등불이 환하게 밝혀져 있었다.\n"
            "모가의 장로들이 거의 다 이곳에 모여 있었고, 하나같이 얼굴에 무거운 빛이 서려 있었다.",
        )

        self.assertGreater(len(pairs), 2)
        self.assertFalse(any(len(pair.source) > 40 for pair in pairs))
        self.assertIn("只有…才…", {pair.grammar_group for pair in pairs})
        self.assertTrue(any(pair.source == "此时" and pair.source_annotation == "지금" for pair in pairs))
        self.assertTrue(any(pair.source == "竟是" and pair.source_annotation == "뜻밖에도" for pair in pairs))

    def test_ai_alignment_merges_punctuation_only_pair(self):
        pairs = _normalize_syntax_alignment_pairs(
            {
                "pairs": [
                    {"source_indexes": [1], "translation_indexes": [1], "confidence": "high"},
                    {"source_indexes": [], "translation_indexes": [2], "confidence": "low"},
                ]
            },
            ["他说。"],
            ["그가 말했다.", '"'],
        )

        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0].source, "他说。")
        self.assertEqual(pairs[0].translation, '그가 말했다."')

    def test_sentence_locked_rows_do_not_use_global_phrase_shift(self):
        sentence_rows = _normalize_sentence_alignment_rows(
            {
                "rows": [
                    {"source_indexes": [1], "translation_indexes": [2], "confidence": "high"},
                    {"source_indexes": [2], "translation_indexes": [1], "confidence": "high"},
                ]
            },
            ["依我看，斩杀也不为过！", "一群人为力几派，激烈交锋。"],
            ["사람들이 몇 파로 나뉘어 격렬하게 맞섰다.", "내가 보기엔, 죽여도 지나치지 않소!"],
        )

        self.assertEqual(sentence_rows[0].source, "依我看，斩杀也不为过！")
        self.assertIn("죽여도", sentence_rows[0].translation)
        self.assertEqual(sentence_rows[1].source, "一群人为力几派，激烈交锋。")
        self.assertIn("격렬하게", sentence_rows[1].translation)


if __name__ == "__main__":
    unittest.main()
