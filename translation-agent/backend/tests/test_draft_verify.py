import unittest

from backend.routers.translate import normalize_draft_verify_response


class DraftVerifyNormalizationTestCase(unittest.TestCase):
    def test_filters_false_dash_issue_when_translation_has_no_dash(self):
        response = normalize_draft_verify_response(
            {
                "overall_score": 82,
                "verdict": "needs_minor_revision",
                "summary": "원문의 엠대시를 번역에서도 사용했습니다. 전반적인 정확도는 양호합니다.",
                "categories": [
                    {
                        "id": "style",
                        "label": "문체/말투",
                        "score": 70,
                        "status": "warning",
                        "comment": "엠대시를 사용한 문장부호가 보여 수정이 필요합니다.",
                    }
                ],
                "issues": [
                    {
                        "severity": "minor",
                        "category": "style",
                        "source_excerpt": "原文——示例",
                        "translation_excerpt": "쉼표로만 처리된 번역문",
                        "problem": "엠대시를 사용했습니다.",
                        "suggestion": "쉼표로 바꾸세요.",
                    }
                ],
                "strengths": [],
            },
            model="test-model",
            translation_text="쉼표로만 처리된 번역문, 자연스럽게 이어지는 문장.",
        )

        self.assertEqual(response.issues, [])
        self.assertNotIn("엠대시", response.summary)
        style_comment = next(category.comment for category in response.categories if category.id == "style")
        self.assertIn("금지된 대시 문장부호는 감지되지 않았습니다", style_comment)


if __name__ == "__main__":
    unittest.main()
