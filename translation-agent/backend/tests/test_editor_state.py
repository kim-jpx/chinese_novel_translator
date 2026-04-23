import unittest

from backend.storage.editor_state import (
    dehydrate_record_editor_state,
    embed_editor_state,
    extract_editor_state,
    hydrate_record_editor_state,
)


class EditorStateTestCase(unittest.TestCase):
    def test_embed_and_extract_alignment_rows_round_trip(self):
        notes = "manual note"
        embedded = embed_editor_state(
            notes,
            alignment_rows=[
                {
                    "id": "row-1",
                    "source_text": "三长老莫不是忘了，那慕凌寒已经元力枯竭，元脉尽毁，彻底沦为废物！",
                    "translation_text": "삼 장로께서는 잊으셨소? 그 모릉한은 이미 원력이 고갈되고 원맥이 전부 파괴되어 완전히 폐인이 되었소!",
                    "locked": True,
                    "origin": "manual",
                },
                {
                    "id": "row-2",
                    "source_text": "就算是不常人家都未必留下这等废物，何况他惹出那般祸事！",
                    "translation_text": "",
                    "locked": False,
                    "origin": "manual",
                },
            ],
        )

        clean_notes, state = extract_editor_state(embedded)

        self.assertEqual(clean_notes, notes)
        self.assertEqual(len(state.get("alignment_rows", [])), 2)
        self.assertEqual(state["alignment_rows"][0]["id"], "row-1")
        self.assertEqual(state["alignment_rows"][1]["translation_text"], "")

    def test_hydrate_and_dehydrate_record_editor_state(self):
        record = {
            "id": "record-1",
            "notes": "existing note",
            "alignment_rows": [
                {
                    "id": "row-1",
                    "source_text": "圣元帝国，帝都天陵，慕家。",
                    "translation_text": "성원제국, 제도 천릉, 모가.",
                    "locked": False,
                    "origin": "auto",
                }
            ],
        }

        dehydrated = dehydrate_record_editor_state(record)
        self.assertIn("[codex-editor-state:v1]", dehydrated["notes"])
        self.assertNotIn("alignment_rows", dehydrated)

        hydrated = hydrate_record_editor_state(dehydrated)
        self.assertEqual(hydrated["notes"], "existing note")
        self.assertEqual(len(hydrated["alignment_rows"]), 1)
        self.assertEqual(hydrated["alignment_rows"][0]["source_text"], "圣元帝国，帝都天陵，慕家。")

    def test_verify_reports_round_trip(self):
        record = {
            "id": "record-2",
            "notes": "verify note",
            "verify_reports": [
                {
                    "id": "verify-1",
                    "created_at": "2026-04-23T10:00:00+00:00",
                    "overall_score": 92,
                    "verdict": "ready",
                    "summary": "전반적으로 자연스럽고 안정적입니다.",
                    "categories": [
                        {
                            "id": "style",
                            "label": "문체/말투",
                            "score": 93,
                            "status": "pass",
                            "comment": "문체가 안정적입니다.",
                        }
                    ],
                    "issues": [],
                    "strengths": ["말투가 안정적입니다."],
                    "model": "test-model",
                }
            ],
        }

        dehydrated = dehydrate_record_editor_state(record)
        hydrated = hydrate_record_editor_state(dehydrated)

        self.assertEqual(hydrated["notes"], "verify note")
        self.assertEqual(len(hydrated["verify_reports"]), 1)
        self.assertEqual(hydrated["verify_reports"][0]["overall_score"], 92)
        self.assertEqual(hydrated["verify_reports"][0]["categories"][0]["id"], "style")


if __name__ == "__main__":
    unittest.main()
