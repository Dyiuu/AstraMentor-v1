"""Build deterministic local course indexes."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
from typing import Any, Iterable
from uuid import uuid4

from rag.course_registry import Course, CourseRegistry
from rag.embeddings import EmbeddingProvider, embedding_provider_from_env
from rag.markdown_parser import MarkdownChunk, build_chunks, section_catalog


logger = logging.getLogger(__name__)
INDEX_SCHEMA_VERSION = 2
TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9_+.-]*|[\u4e00-\u9fff]+")


def tokenize(text: str) -> list[str]:
    normalized = text.lower()
    try:
        import jieba  # type: ignore[import-not-found]

        return [token.strip() for token in jieba.cut(normalized) if token.strip()]
    except ImportError:
        tokens: list[str] = []
        for match in TOKEN_PATTERN.findall(normalized):
            if re.fullmatch(r"[\u4e00-\u9fff]+", match):
                tokens.extend(match)
                tokens.extend(match[index : index + 2] for index in range(len(match) - 1))
            else:
                tokens.append(match)
        return tokens


def _source_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _artifact_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


@dataclass(frozen=True)
class IndexStatus:
    status: str
    course_id: str
    chunk_count: int = 0
    message: str = ""
    built_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "course_id": self.course_id,
            "chunk_count": self.chunk_count,
            "message": self.message,
            "built_at": self.built_at,
        }


class CourseIndexer:
    def __init__(
        self,
        registry: CourseRegistry | None = None,
        embedding_provider: EmbeddingProvider | None = None,
    ) -> None:
        self.registry = registry or CourseRegistry()
        self.embedding_provider = embedding_provider or embedding_provider_from_env()

    def status(self, course_id: str) -> IndexStatus:
        course = self.registry.get(course_id)
        index_dir = self.registry.index_dir(course_id)
        manifest_path = index_dir / "manifest.json"
        if not manifest_path.exists():
            return IndexStatus("missing", course_id, message="索引尚未构建")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(manifest, dict):
                raise ValueError("manifest must be an object")
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
            return IndexStatus("stale", course_id, message="索引清单损坏")
        if manifest.get("schema_version") != INDEX_SCHEMA_VERSION:
            return IndexStatus("stale", course_id, message="索引版本已过期")
        if manifest.get("course_id") != course_id:
            return IndexStatus("stale", course_id, message="索引课程标识不匹配")
        try:
            current_hashes = {
                material.relative_path: _source_hash(material.path)
                for material in course.materials
            }
        except OSError:
            return IndexStatus(
                "stale", course_id, message="课程资料缺失或不可读 (missing or unreadable)"
            )
        if manifest.get("source_hashes") != current_hashes:
            return IndexStatus("stale", course_id, message="课程资料已更新")

        try:
            chunk_count = self._validate_artifacts(course, index_dir, manifest)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, TypeError):
            return IndexStatus("stale", course_id, message="索引生成物损坏或不完整")
        return IndexStatus(
            "ready",
            course_id,
            chunk_count=chunk_count,
            built_at=str(manifest.get("built_at", "")),
        )

    @staticmethod
    def _read_chunks(path: Path) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError("chunk row must be an object")
            rows.append(row)
        return rows

    def _validate_artifacts(
        self, course: Course, index_dir: Path, manifest: dict[str, Any]
    ) -> int:
        chunk_count = manifest.get("chunk_count")
        if (
            isinstance(chunk_count, bool)
            or not isinstance(chunk_count, int)
            or chunk_count <= 0
        ):
            raise ValueError("chunk_count must be a positive integer")

        artifact_hashes = manifest.get("artifact_hashes")
        if not isinstance(artifact_hashes, dict):
            raise ValueError("artifact_hashes is required")
        for filename in ("chunks.jsonl", "bm25.json"):
            artifact_path = index_dir / filename
            expected_hash = artifact_hashes.get(filename)
            if (
                not artifact_path.is_file()
                or not isinstance(expected_hash, str)
                or _artifact_hash(artifact_path) != expected_hash
            ):
                raise ValueError(f"invalid artifact: {filename}")

        chunks = self._read_chunks(index_dir / "chunks.jsonl")
        if len(chunks) != chunk_count:
            raise ValueError("chunk_count does not match chunks.jsonl")
        chunk_ids: list[str] = []
        for chunk in chunks:
            chunk_id = chunk.get("chunk_id")
            if not isinstance(chunk_id, str) or not chunk_id:
                raise ValueError("chunk_id is required")
            if chunk.get("course_id") != course.id:
                raise ValueError("chunk belongs to another course")
            chunk_ids.append(chunk_id)
        if len(set(chunk_ids)) != len(chunk_ids):
            raise ValueError("duplicate chunk ids")

        bm25 = json.loads((index_dir / "bm25.json").read_text(encoding="utf-8"))
        if not isinstance(bm25, dict):
            raise ValueError("bm25 index must be an object")
        bm25_ids = bm25.get("chunk_ids")
        lengths = bm25.get("document_lengths")
        frequencies = bm25.get("term_frequencies")
        if bm25_ids != chunk_ids:
            raise ValueError("BM25 chunk references do not match chunks")
        if not isinstance(lengths, list) or len(lengths) != chunk_count:
            raise ValueError("invalid BM25 document lengths")
        if not isinstance(frequencies, list) or len(frequencies) != chunk_count:
            raise ValueError("invalid BM25 term frequencies")
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or value < 0
            for value in lengths
        ):
            raise ValueError("invalid BM25 document length")
        if any(not isinstance(value, dict) for value in frequencies):
            raise ValueError("invalid BM25 term frequency row")
        if not isinstance(bm25.get("document_frequency"), dict):
            raise ValueError("invalid BM25 document frequency")
        average_length = bm25.get("average_length")
        if (
            isinstance(average_length, bool)
            or not isinstance(average_length, (int, float))
            or average_length < 0
        ):
            raise ValueError("invalid BM25 average length")

        embedding = manifest.get("embedding")
        if embedding is not None:
            if not isinstance(embedding, dict):
                raise ValueError("embedding metadata must be an object")
            dimension = embedding.get("dimension")
            if (
                isinstance(dimension, bool)
                or not isinstance(dimension, int)
                or dimension <= 0
                or not isinstance(embedding.get("model"), str)
                or not embedding.get("model")
            ):
                raise ValueError("invalid embedding metadata")
            vectors_path = index_dir / "vectors.jsonl"
            expected_hash = artifact_hashes.get("vectors.jsonl")
            if (
                not vectors_path.is_file()
                or not isinstance(expected_hash, str)
                or _artifact_hash(vectors_path) != expected_hash
            ):
                raise ValueError("invalid vector artifact")
            vector_rows = self._read_chunks(vectors_path)
            vector_ids = [row.get("chunk_id") for row in vector_rows]
            if vector_ids != chunk_ids:
                raise ValueError("vector chunk references do not match chunks")
            if any(not isinstance(row.get("vector"), list) for row in vector_rows):
                raise ValueError("invalid vector row")
            if any(len(row["vector"]) != dimension for row in vector_rows):
                raise ValueError("vector dimension does not match manifest")
        return chunk_count

    def build(self, course_id: str, force: bool = False) -> IndexStatus:
        course = self.registry.get(course_id)
        current = self.status(course_id)
        if current.status == "ready" and not force:
            return current

        chunks: list[MarkdownChunk] = []
        source_hashes: dict[str, str] = {}
        for material in course.materials:
            source_bytes = material.path.read_bytes()
            source_hashes[material.relative_path] = hashlib.sha256(
                source_bytes
            ).hexdigest()
            chunks.extend(
                build_chunks(
                    markdown=source_bytes.decode("utf-8"),
                    course_id=course.id,
                    material_id=material.id,
                    document_title=material.title,
                    source_path=material.relative_path,
                )
            )

        if not chunks:
            raise ValueError(f"course {course_id} produced zero index chunks")

        index_dir = self.registry.index_dir(course_id)
        index_dir.mkdir(parents=True, exist_ok=True)

        document_terms: list[Counter[str]] = []
        document_lengths: list[int] = []
        document_frequency: Counter[str] = Counter()
        for chunk in chunks:
            heading = " ".join(chunk.section_path)
            terms = tokenize(f"{heading} {heading} {heading} {chunk.text}")
            term_counts = Counter(terms)
            document_terms.append(term_counts)
            document_lengths.append(len(terms))
            document_frequency.update(term_counts.keys())
        bm25_data = {
            "chunk_ids": [chunk.chunk_id for chunk in chunks],
            "document_lengths": document_lengths,
            "average_length": sum(document_lengths) / len(document_lengths),
            "document_frequency": dict(document_frequency),
            "term_frequencies": [dict(counts) for counts in document_terms],
        }

        embedding_info: dict[str, Any] | None = None
        vector_rows: list[dict[str, Any]] | None = None
        if self.embedding_provider and chunks:
            try:
                rows: list[dict[str, Any]] = []
                batch_size = 32
                for start in range(0, len(chunks), batch_size):
                    batch = chunks[start : start + batch_size]
                    vectors = self.embedding_provider.embed([chunk.text for chunk in batch])
                    if len(vectors) != len(batch):
                        raise ValueError("embedding provider returned the wrong vector count")
                    rows.extend(
                        {"chunk_id": chunk.chunk_id, "vector": vector}
                        for chunk, vector in zip(batch, vectors)
                    )
                dimension = len(rows[0]["vector"]) if rows else 0
                if not dimension or any(len(row["vector"]) != dimension for row in rows):
                    raise ValueError("embedding provider returned invalid dimensions")
                vector_rows = rows
                embedding_info = {
                    "model": self.embedding_provider.model,
                    "dimension": dimension,
                }
            except Exception as exc:  # optional feature must degrade cleanly
                logger.warning("Embedding index failed for %s: %s", course_id, exc)
                vector_rows = None
                embedding_info = None

        # Chunks and hashes must describe the same immutable snapshot.  Abort
        # before publishing if an editor or sync process changed a material
        # while BM25/embedding work was running.
        try:
            latest_hashes = {
                material.relative_path: _source_hash(material.path)
                for material in course.materials
            }
        except OSError as exc:
            raise RuntimeError("course materials changed during index build") from exc
        if latest_hashes != source_hashes:
            raise RuntimeError("course materials changed during index build")

        built_at = datetime.now(timezone.utc).isoformat()
        token = uuid4().hex
        temp_paths = {
            "chunks.jsonl": index_dir / f".chunks.{token}.tmp",
            "bm25.json": index_dir / f".bm25.{token}.tmp",
            "manifest.json": index_dir / f".manifest.{token}.tmp",
        }
        if vector_rows is not None:
            temp_paths["vectors.jsonl"] = index_dir / f".vectors.{token}.tmp"
        try:
            _write_jsonl(
                temp_paths["chunks.jsonl"], (chunk.to_dict() for chunk in chunks)
            )
            _write_json(temp_paths["bm25.json"], bm25_data)
            if vector_rows is not None:
                _write_jsonl(temp_paths["vectors.jsonl"], vector_rows)

            artifact_hashes = {
                filename: _artifact_hash(temp_paths[filename])
                for filename in ("chunks.jsonl", "bm25.json")
            }
            if vector_rows is not None:
                artifact_hashes["vectors.jsonl"] = _artifact_hash(
                    temp_paths["vectors.jsonl"]
                )
            manifest = {
                "schema_version": INDEX_SCHEMA_VERSION,
                "course_id": course.id,
                "course_version": course.version,
                "source_hashes": source_hashes,
                "artifact_hashes": artifact_hashes,
                "chunking": {
                    "target_chars": 700,
                    "max_chars": 900,
                    "overlap_chars": 120,
                },
                "chunk_count": len(chunks),
                "section_count": len(section_catalog(chunks)),
                "embedding": embedding_info,
                "built_at": built_at,
            }
            _write_json(temp_paths["manifest.json"], manifest)

            # Publish the manifest last.  A process crash before this point can
            # therefore expose either the previous complete index or a stale
            # index, never a newly advertised half-index.
            os.replace(temp_paths["chunks.jsonl"], index_dir / "chunks.jsonl")
            os.replace(temp_paths["bm25.json"], index_dir / "bm25.json")
            vectors_path = index_dir / "vectors.jsonl"
            if vector_rows is not None:
                os.replace(temp_paths["vectors.jsonl"], vectors_path)
            elif vectors_path.exists():
                vectors_path.unlink()
            os.replace(temp_paths["manifest.json"], index_dir / "manifest.json")
        finally:
            for temp_path in temp_paths.values():
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    logger.warning("Failed to clean temporary index file %s", temp_path)
        published = self.status(course_id)
        if published.status != "ready":
            raise RuntimeError(
                f"published course index failed validation: {published.message}"
            )
        return published
