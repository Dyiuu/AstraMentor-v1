from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from rag.course_registry import CourseRegistry
from rag.indexer import CourseIndexer
from rag.retriever import CourseRetriever


ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "tests" / "fixtures" / "course_retrieval_cases.json"
COURSE_IDS = (
    "llm-app-development",
    "rag-knowledge-engineering",
    "agent-engineering",
    "ai-app-production",
)
EMBEDDING_ENV = {
    "ASTRA_RAG_EMBEDDING_PROVIDER": "",
    "ASTRA_RAG_EMBEDDING_MODEL": "",
    "ASTRA_RAG_EMBEDDING_ENDPOINT": "",
    "ASTRA_RAG_EMBEDDING_API_KEY": "",
}


class CourseRetrievalAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        cls.registry = CourseRegistry(
            courses_root=ROOT / "rag" / "courses",
            indexes_root=Path(cls.temp.name) / "indexes",
        )
        cls.cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
        cls.retrievers: dict[str, CourseRetriever] = {}
        with patch.dict(os.environ, EMBEDDING_ENV, clear=False):
            indexer = CourseIndexer(cls.registry)
            for course_id in COURSE_IDS:
                status = indexer.build(course_id, force=True)
                if status.status != "ready":
                    raise AssertionError(f"failed to build test index for {course_id}")
                cls.retrievers[course_id] = CourseRetriever(
                    course_id,
                    registry=cls.registry,
                    auto_build=False,
                )

    def test_fixture_contains_exactly_twenty_balanced_cases(self) -> None:
        self.assertEqual(len(self.cases), 20)
        counts = {course_id: 0 for course_id in COURSE_IDS}
        case_ids: set[str] = set()
        for case in self.cases:
            self.assertNotIn(case["id"], case_ids)
            case_ids.add(case["id"])
            counts[case["course_id"]] += 1
            self.assertTrue(case["query"].strip())
            self.assertTrue(case["expected_material_id"].strip())
            self.assertTrue(case["expected_section"].strip())
        self.assertEqual(counts, {course_id: 5 for course_id in COURSE_IDS})

    def test_bm25_retrieves_expected_project_and_safe_source(self) -> None:
        for case in self.cases:
            course_id = case["course_id"]
            course = self.registry.get(course_id)
            with patch.dict(os.environ, EMBEDDING_ENV, clear=False):
                results = self.retrievers[course_id].search(case["query"], top_k=5)
            with self.subTest(case=case["id"]):
                self.assertTrue(results)
                self.assertTrue(all(result.retrieval == "bm25" for result in results))
                self.assertTrue(
                    all(result.chunk["course_id"] == course_id for result in results)
                )
                expected_hits = [
                    result
                    for result in results
                    if result.chunk["material_id"] == case["expected_material_id"]
                ]
                self.assertTrue(
                    expected_hits,
                    f"expected {case['expected_material_id']}, got "
                    f"{[item.chunk['material_id'] for item in results]}",
                )
                self.assertTrue(
                    any(
                        case["expected_section"].lower()
                        in " > ".join(hit.chunk["section_path"]).lower()
                        for hit in expected_hits
                    ),
                    f"expected section {case['expected_section']!r}, got "
                    f"{[hit.chunk['section_path'] for hit in expected_hits]}",
                )
                for result in results:
                    chunk = result.chunk
                    source = (course.root / chunk["source_path"]).resolve()
                    source.relative_to(course.root.resolve())
                    self.assertTrue(source.is_file())
                    self.assertEqual(source.suffix.lower(), ".md")
                    line_count = len(source.read_text(encoding="utf-8").splitlines())
                    self.assertGreaterEqual(chunk["line_start"], 1)
                    self.assertGreaterEqual(chunk["line_end"], chunk["line_start"])
                    self.assertLessEqual(chunk["line_end"], line_count)


if __name__ == "__main__":
    unittest.main()
