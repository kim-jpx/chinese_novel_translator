import asyncio
import unittest
from unittest.mock import patch

import backend.llm as llm


class LlmTests(unittest.TestCase):
    def test_task_model_has_upload_defaults_for_each_provider(self):
        with patch.dict(
            llm.os.environ,
            {
                "ANTHROPIC_UPLOAD_MODEL": "",
                "OPENAI_UPLOAD_MODEL": "",
                "GEMINI_UPLOAD_MODEL": "",
            },
            clear=False,
        ):
            self.assertEqual(llm.task_model("anthropic", "upload"), "claude-haiku-4-5")
            self.assertEqual(llm.task_model("openai", "upload"), "gpt-5-mini")
            self.assertEqual(llm.task_model("gemini", "upload"), "gemini-2.5-flash")

    def test_generate_text_sync_runs_without_active_event_loop(self):
        async def fake_generate_text(**kwargs):
            return llm.LlmTextResponse(
                provider="openai",
                model="gpt-5-mini",
                text=f"ok:{kwargs['task']}",
            )

        with patch("backend.llm.generate_text", side_effect=fake_generate_text):
            response = llm.generate_text_sync(
                task="upload",
                action="bridge test",
                user_prompt="hello",
                requested_provider="openai",
            )

        self.assertEqual(response.provider, "openai")
        self.assertEqual(response.text, "ok:upload")

    def test_generate_text_sync_bridges_active_event_loop(self):
        async def fake_generate_text(**kwargs):
            await asyncio.sleep(0)
            return llm.LlmTextResponse(
                provider="gemini",
                model="gemini-2.5-flash",
                text="loop-safe",
            )

        async def run_inside_loop():
            return llm.generate_text_sync(
                task="upload",
                action="bridge test",
                user_prompt="hello",
                requested_provider="gemini",
            )

        with patch("backend.llm.generate_text", side_effect=fake_generate_text):
            response = asyncio.run(run_inside_loop())

        self.assertEqual(response.provider, "gemini")
        self.assertEqual(response.text, "loop-safe")


if __name__ == "__main__":
    unittest.main()
