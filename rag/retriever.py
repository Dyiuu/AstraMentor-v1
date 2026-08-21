"""Hybrid local course retrieval with BM25 and optional vectors."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Any

from rag.course_registry import CourseRegistry
from rag.embeddings import EmbeddingProvider, embedding_provider_from_env
from rag.errors import CourseIndexNotReadyError
from rag.indexer import CourseIndexer, tokenize


@dataclass(frozen=True)
class RetrievalResult:
    chunk: dict[str, Any]
    score: float
    rank: int
    retrieval: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "rank": self.rank,
            "retrieval": self.retrieval,
            "chunk": self.chunk,
        }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


class CourseRetriever:
    def __init__(
        self,
        course_id: str,
        registry: CourseRegistry | None = None,
        embedding_provider: EmbeddingProvider | None = None,
        auto_build: bool = False,
    ) -> None:
        self.registry = registry or CourseRegistry()
        self.course = self.registry.get(course_id)
        self.embedding_provider = embedding_provider or embedding_provider_from_env()
        self.indexer = CourseIndexer(self.registry, self.embedding_provider)
        status = self.indexer.status(course_id)
        if status.status != "ready":
            if auto_build:
                status = self.indexer.build(course_id)
            else:
                raise CourseIndexNotReadyError(
                    course_id, status.status, status.message or "课程索引尚未就绪"
                )
        self.index_dir = self.registry.index_dir(course_id)
        try:
            self.chunks = _read_jsonl(self.index_dir / "chunks.jsonl")
            self.chunk_by_id = {chunk["chunk_id"]: chunk for chunk in self.chunks}
            self.bm25 = json.loads(
                (self.index_dir / "bm25.json").read_text(encoding="utf-8")
            )
            self.vectors = {
                row["chunk_id"]: row["vector"]
                for row in _read_jsonl(self.index_dir / "vectors.jsonl")
            }
            self._validate_loaded_index()
        except CourseIndexNotReadyError:
            raise
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise CourseIndexNotReadyError(
                course_id, "stale", "课程索引损坏，请重新构建"
            ) from exc

    def _validate_loaded_index(self) -> None:
        chunk_ids: list[str] = []
        for chunk in self.chunks:
            if chunk.get("course_id") != self.course.id:
                raise ValueError("course index contains a foreign chunk")
            chunk_id = chunk.get("chunk_id")
            if not isinstance(chunk_id, str) or not chunk_id:
                raise ValueError("course index contains an invalid chunk id")
            chunk_ids.append(chunk_id)
        if not chunk_ids or len(set(chunk_ids)) != len(chunk_ids):
            raise ValueError("course index has missing or duplicate chunks")
        if list(self.bm25.get("chunk_ids", [])) != chunk_ids:
            raise ValueError("BM25 references do not match course chunks")
        if len(self.bm25.get("document_lengths", [])) != len(chunk_ids):
            raise ValueError("BM25 document lengths do not match course chunks")
        if len(self.bm25.get("term_frequencies", [])) != len(chunk_ids):
            raise ValueError("BM25 frequencies do not match course chunks")
        if any(chunk_id not in self.chunk_by_id for chunk_id in self.bm25["chunk_ids"]):
            raise ValueError("BM25 references an unknown chunk")
        if any(chunk_id not in self.chunk_by_id for chunk_id in self.vectors):
            raise ValueError("vector index references an unknown chunk")

    def _require_current_index(self) -> None:
        status = self.indexer.status(self.course.id)
        if status.status != "ready":
            raise CourseIndexNotReadyError(
                self.course.id,
                status.status,
                status.message or "课程索引尚未就绪",
            )

    def _bm25(self, query: str, limit: int) -> list[tuple[str, float]]:
        query_terms = tokenize(query)
        if not query_terms:
            return []
        chunk_ids = self.bm25["chunk_ids"]
        lengths = self.bm25["document_lengths"]
        avg_length = float(self.bm25.get("average_length") or 1.0)
        dfs = self.bm25["document_frequency"]
        term_frequencies = self.bm25["term_frequencies"]
        document_count = max(1, len(chunk_ids))
        k1, b = 1.5, 0.75
        scored: list[tuple[str, float]] = []
        for index, chunk_id in enumerate(chunk_ids):
            score = 0.0
            frequencies = term_frequencies[index]
            for term in query_terms:
                tf = float(frequencies.get(term, 0))
                if not tf:
                    continue
                df = float(dfs.get(term, 0))
                idf = math.log(1 + (document_count - df + 0.5) / (df + 0.5))
                denominator = tf + k1 * (1 - b + b * lengths[index] / avg_length)
                score += idf * (tf * (k1 + 1) / denominator)
            if score > 0:
                scored.append((chunk_id, score))
        return sorted(scored, key=lambda item: item[1], reverse=True)[:limit]

    def _semantic(self, query: str, limit: int) -> list[tuple[str, float]]:
        if not self.embedding_provider or not self.vectors:
            return []
        try:
            query_vector = self.embedding_provider.embed([query])[0]
        except Exception:
            return []
        scores = [
            (chunk_id, _cosine(query_vector, vector))
            for chunk_id, vector in self.vectors.items()
        ]
        return sorted(scores, key=lambda item: item[1], reverse=True)[:limit]

    def search(self, query: str, top_k: int = 5, candidate_k: int = 12) -> list[RetrievalResult]:
        # The source files may change after service construction.  Rechecking
        # here closes that race instead of serving evidence from an obsolete
        # course snapshot.
        self._require_current_index()
        lexical = self._bm25(query, candidate_k)
        semantic = self._semantic(query, candidate_k)
        if semantic:
            fused: dict[str, float] = {}
            for ranking in (lexical, semantic):
                for rank, (chunk_id, _score) in enumerate(ranking, start=1):
                    fused[chunk_id] = fused.get(chunk_id, 0.0) + 1 / (60 + rank)
            ordered = sorted(fused.items(), key=lambda item: item[1], reverse=True)
            retrieval = "hybrid"
        else:
            ordered = lexical
            retrieval = "bm25"
        results: list[RetrievalResult] = []
        for rank, (chunk_id, score) in enumerate(ordered[:top_k], start=1):
            chunk = self.chunk_by_id.get(chunk_id)
            if chunk:
                results.append(RetrievalResult(chunk, float(score), rank, retrieval))
        return results
