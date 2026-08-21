from __future__ import annotations

from types import SimpleNamespace
import unittest

from services.streaming_service import encode_sse
from utils.api_client import APIClient


def _chunk(*, content: str | None = None, reasoning: str | None = None):
    delta = SimpleNamespace(content=content, reasoning_content=reasoning, reasoning=None)
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta)])


class _Completions:
    def __init__(self, fail_thinking: bool = False) -> None:
        self.calls: list[dict] = []
        self.fail_thinking = fail_thinking

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail_thinking and "extra_body" in kwargs:
            raise RuntimeError("unsupported reasoning")
        return iter([_chunk(reasoning="分析"), _chunk(content="回答")])


class StreamingTests(unittest.TestCase):
    def _client(self, completions: _Completions) -> APIClient:
        client = APIClient.__new__(APIClient)
        client.provider = "openrouter"
        client.model_name = "demo/model"
        client.client = SimpleNamespace(
            chat=SimpleNamespace(completions=completions)
        )
        return client

    def test_stream_separates_reasoning_and_content_and_passes_options(self) -> None:
        completions = _Completions()
        events = list(
            self._client(completions).stream_generate(
                "问题", max_tokens=1024, thinking=True
            )
        )
        self.assertEqual(events[0], {"type": "reasoning_delta", "text": "分析"})
        self.assertEqual(events[1], {"type": "content_delta", "text": "回答"})
        self.assertEqual(completions.calls[0]["max_tokens"], 1024)
        self.assertIn("reasoning", completions.calls[0]["extra_body"])

    def test_unsupported_thinking_warns_and_retries(self) -> None:
        completions = _Completions(fail_thinking=True)
        events = list(self._client(completions).stream_generate("问题", thinking=True))
        self.assertEqual(events[0]["type"], "warning")
        self.assertEqual(events[-1]["text"], "回答")
        self.assertEqual(len(completions.calls), 2)
        self.assertNotIn("extra_body", completions.calls[1])

    def test_sse_payload_is_json_and_newline_safe(self) -> None:
        encoded = encode_sse("content_delta", {"text": "第一行\n第二行"})
        self.assertTrue(encoded.startswith("event: content_delta\n"))
        self.assertIn("第一行\\n第二行", encoded)
        self.assertTrue(encoded.endswith("\n\n"))


if __name__ == "__main__":
    unittest.main()
