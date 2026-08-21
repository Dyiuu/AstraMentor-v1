"""Optional, provider-neutral OpenAI-compatible embedding adapter."""

from __future__ import annotations

import json
import os
from typing import Protocol
from urllib.request import Request, urlopen


class EmbeddingProvider(Protocol):
    model: str

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenAICompatibleEmbeddingProvider:
    def __init__(self, endpoint: str, api_key: str, model: str) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.model = model

    def embed(self, texts: list[str]) -> list[list[float]]:
        url = self.endpoint
        if not url.endswith("/embeddings"):
            url = f"{url}/embeddings"
        payload = json.dumps({"model": self.model, "input": texts}).encode("utf-8")
        request = Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        with urlopen(request, timeout=45) as response:  # noqa: S310 - configured endpoint
            body = json.loads(response.read().decode("utf-8"))
        rows = sorted(body.get("data", []), key=lambda item: item.get("index", 0))
        vectors = [row.get("embedding") for row in rows]
        if len(vectors) != len(texts) or not all(isinstance(vector, list) for vector in vectors):
            raise ValueError("embedding endpoint returned an invalid response")
        return [[float(value) for value in vector] for vector in vectors]


def embedding_provider_from_env() -> EmbeddingProvider | None:
    provider = os.getenv("ASTRA_RAG_EMBEDDING_PROVIDER", "").strip().lower()
    model = os.getenv("ASTRA_RAG_EMBEDDING_MODEL", "").strip()
    if not provider or not model:
        return None
    endpoint = (
        os.getenv("ASTRA_RAG_EMBEDDING_ENDPOINT", "").strip()
        or os.getenv("ASTRA_API_ENDPOINT", "").strip()
    )
    api_key = (
        os.getenv("ASTRA_RAG_EMBEDDING_API_KEY", "").strip()
        or os.getenv("ASTRA_API_KEY", "").strip()
    )
    if not endpoint or not api_key:
        return None
    return OpenAICompatibleEmbeddingProvider(endpoint=endpoint, api_key=api_key, model=model)
