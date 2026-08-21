from __future__ import annotations

import json
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from rag.citations import citations_from_results, validate_citation_ids
from rag.course_registry import CourseRegistry
from rag.errors import CourseIndexNotReadyError
from rag.indexer import CourseIndexer
from rag.markdown_parser import build_chunks
from rag.retriever import CourseRetriever


class _KeywordEmbedding:
    model = "fake-keyword"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [
            [float("苹果" in text), float("工作流" in text), float(len(text) > 20)]
            for text in texts
        ]


class _BrokenEmbedding:
    model = "fake-broken"

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise TimeoutError("simulated timeout")


def _write_course(root: Path, course_id: str = "demo") -> CourseRegistry:
    course_root = root / "courses" / course_id
    materials = course_root / "materials"
    materials.mkdir(parents=True)
    (materials / "book.md").write_text(
        "# 示例课程\n\n"
        "## 第一章 苹果基础\n\n苹果是一种水果，适合演示关键词检索。\n\n"
        "## 第二章 工作流\n\n工作流由输入节点、处理节点和输出节点组成。\n",
        encoding="utf-8",
    )
    (course_root / "course.yaml").write_text(
        json.dumps(
            {
                "id": course_id,
                "title": "示例课程",
                "version": "1.0",
                "materials": [
                    {"id": "book", "title": "示例教材", "path": "materials/book.md"}
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return CourseRegistry(root / "courses", root / "indexes")


class MarkdownChunkTests(unittest.TestCase):
    def test_heading_aware_chunks_are_stable(self) -> None:
        markdown = "# 课程\n\n## 第一节\n\n基础内容。\n\n## 第二节\n\n进阶内容。"
        first = build_chunks(
            markdown=markdown,
            course_id="demo",
            material_id="book",
            document_title="教材",
            source_path="materials/book.md",
            target_chars=20,
            max_chars=50,
            overlap_chars=5,
        )
        second = build_chunks(
            markdown=markdown,
            course_id="demo",
            material_id="book",
            document_title="教材",
            source_path="materials/book.md",
            target_chars=20,
            max_chars=50,
            overlap_chars=5,
        )
        self.assertEqual([chunk.chunk_id for chunk in first], [chunk.chunk_id for chunk in second])
        self.assertEqual(first[0].section_path, ("课程", "第一节"))
        self.assertGreaterEqual(first[0].line_start, 1)

    def test_repeated_paragraphs_keep_unique_chunk_ids(self) -> None:
        markdown = (
            "# 课程\n\n## 第一节\n\n"
            "这是一段会在同一章节重复出现的较长正文。\n\n"
            "这是一段会在同一章节重复出现的较长正文。\n"
        )
        chunks = build_chunks(
            markdown=markdown,
            course_id="demo",
            material_id="book",
            document_title="教材",
            source_path="materials/book.md",
            target_chars=5,
            max_chars=100,
            overlap_chars=10,
        )
        self.assertEqual(len(chunks), 2)
        self.assertEqual(len({chunk.chunk_id for chunk in chunks}), 2)
        self.assertEqual(chunks[0].content_hash, chunks[1].content_hash)


class RegistryAndRetrievalTests(unittest.TestCase):
    def test_registry_and_bm25_search(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            self.assertEqual(registry.get("demo").title, "示例课程")
            CourseIndexer(registry).build("demo")
            results = CourseRetriever("demo", registry=registry).search("苹果是什么")
            self.assertTrue(results)
            self.assertIn("苹果", results[0].chunk["text"])
            self.assertEqual(results[0].retrieval, "bm25")

    def test_embedding_failure_degrades_to_bm25(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            CourseIndexer(registry, _BrokenEmbedding()).build("demo", force=True)
            self.assertFalse((root / "indexes" / "demo" / "vectors.jsonl").exists())
            results = CourseRetriever(
                "demo", registry=registry, embedding_provider=_BrokenEmbedding()
            ).search("工作流")
            self.assertTrue(results)
            self.assertEqual(results[0].retrieval, "bm25")

    def test_hybrid_search_and_citation_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            provider = _KeywordEmbedding()
            CourseIndexer(registry, provider).build("demo", force=True)
            results = CourseRetriever(
                "demo", registry=registry, embedding_provider=provider
            ).search("工作流")
            self.assertTrue(results)
            self.assertEqual(results[0].retrieval, "hybrid")
            citations = citations_from_results(results)
            valid_id = citations[0]["citation_id"]
            validated = validate_citation_ids([valid_id, "invented", valid_id], results)
            self.assertEqual([item["citation_id"] for item in validated], [valid_id])

    def test_invalid_course_is_isolated(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root, "valid")
            invalid_root = root / "courses" / "invalid"
            invalid_root.mkdir(parents=True)
            (invalid_root / "course.yaml").write_text(
                json.dumps(
                    {
                        "id": "invalid",
                        "title": "坏课程",
                        "materials": [
                            {"id": "bad", "path": "../outside.md"}
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            registry.refresh()
            self.assertEqual([course.id for course in registry.list_courses()], ["valid"])
            self.assertIn("invalid", registry.errors())

    def test_manifest_course_and_required_artifacts_are_verified(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            indexer = CourseIndexer(registry)
            indexer.build("demo")
            manifest_path = root / "indexes" / "demo" / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["course_id"] = "another-course"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            self.assertEqual(indexer.status("demo").status, "stale")

            indexer.build("demo", force=True)
            (root / "indexes" / "demo" / "chunks.jsonl").unlink()
            self.assertEqual(indexer.status("demo").status, "stale")

    def test_corrupt_counts_and_foreign_references_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            indexer = CourseIndexer(registry)
            indexer.build("demo")
            index_dir = root / "indexes" / "demo"
            bm25_path = index_dir / "bm25.json"
            manifest_path = index_dir / "manifest.json"
            bm25 = json.loads(bm25_path.read_text(encoding="utf-8"))
            bm25["chunk_ids"][0] = "demo:missing"
            bm25_path.write_text(json.dumps(bm25), encoding="utf-8")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifact_hashes"]["bm25.json"] = hashlib.sha256(
                bm25_path.read_bytes()
            ).hexdigest()
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            self.assertEqual(indexer.status("demo").status, "stale")
            with self.assertRaises(CourseIndexNotReadyError):
                CourseRetriever("demo", registry=registry)

    def test_course_changes_and_indexes_are_isolated(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root, "course-a")
            _write_course(root, "course-b")
            registry.refresh()
            indexer = CourseIndexer(registry)
            indexer.build("course-a")
            indexer.build("course-b")
            registry.get("course-a").materials[0].path.write_text(
                "# 已修改\n\n只修改 A 课程。", encoding="utf-8"
            )
            self.assertEqual(indexer.status("course-a").status, "stale")
            self.assertEqual(indexer.status("course-b").status, "ready")

    def test_missing_source_is_reported_as_stale_instead_of_raising(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            indexer = CourseIndexer(registry)
            indexer.build("demo")
            registry.get("demo").materials[0].path.unlink()
            status = indexer.status("demo")
            self.assertEqual(status.status, "stale")
            self.assertIn("unreadable", status.message.lower())

    def test_zero_chunk_course_cannot_be_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            registry.get("demo").materials[0].path.write_text(
                "# 只有标题", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "zero index chunks"):
                CourseIndexer(registry).build("demo")
            self.assertNotEqual(CourseIndexer(registry).status("demo").status, "ready")

    def test_failed_publish_never_advertises_half_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            indexer = CourseIndexer(registry)
            indexer.build("demo")
            registry.get("demo").materials[0].path.write_text(
                "# 新版本\n\n新的索引内容。", encoding="utf-8"
            )
            real_replace = __import__("os").replace
            calls = 0

            def fail_second_replace(source, target):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("simulated publish failure")
                return real_replace(source, target)

            with patch("rag.indexer.os.replace", side_effect=fail_second_replace):
                with self.assertRaisesRegex(OSError, "publish failure"):
                    indexer.build("demo", force=True)
            self.assertEqual(indexer.status("demo").status, "stale")
            self.assertFalse(list((root / "indexes" / "demo").glob(".*.tmp")))

    def test_source_change_during_build_is_never_published_ready(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry = _write_course(root)
            indexer = CourseIndexer(registry)
            source = registry.get("demo").materials[0].path
            real_build_chunks = build_chunks

            def mutate_after_snapshot(**kwargs):
                chunks = real_build_chunks(**kwargs)
                source.write_text("# 新版本\n\n构建过程中写入的新教材。", encoding="utf-8")
                return chunks

            with patch("rag.indexer.build_chunks", side_effect=mutate_after_snapshot):
                with self.assertRaisesRegex(RuntimeError, "materials changed"):
                    indexer.build("demo", force=True)
            self.assertNotEqual(indexer.status("demo").status, "ready")
            self.assertFalse((root / "indexes" / "demo" / "manifest.json").exists())
            self.assertFalse(list((root / "indexes" / "demo").glob(".*.tmp")))


if __name__ == "__main__":
    unittest.main()
