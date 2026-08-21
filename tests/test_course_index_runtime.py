from __future__ import annotations

import unittest

from backend.course_runtime import CourseIndexRuntime
from rag.errors import CourseIndexNotReadyError
from rag.indexer import IndexStatus


class _FakeIndexer:
    def __init__(self) -> None:
        self.registry = object()
        self.statuses = {
            "course-a": IndexStatus("missing", "course-a", message="missing"),
            "course-b": IndexStatus("missing", "course-b", message="missing"),
        }
        self.failures: dict[str, str] = {}
        self.build_calls: list[tuple[str, bool]] = []

    def status(self, course_id: str) -> IndexStatus:
        if course_id not in self.statuses:
            raise KeyError(course_id)
        return self.statuses[course_id]

    def build(self, course_id: str, force: bool = False) -> IndexStatus:
        self.build_calls.append((course_id, force))
        if course_id in self.failures:
            raise RuntimeError(self.failures.pop(course_id))
        ready = IndexStatus("ready", course_id, chunk_count=3)
        self.statuses[course_id] = ready
        return ready


class CourseIndexRuntimeTests(unittest.TestCase):
    def test_failure_retry_and_ready_state_machine(self) -> None:
        indexer = _FakeIndexer()
        runtime = CourseIndexRuntime(indexer)  # type: ignore[arg-type]
        indexer.failures["course-a"] = "build exploded"

        self.assertTrue(runtime.begin_build("course-a"))
        self.assertEqual(runtime.status("course-a").status, "building")
        runtime.run_build("course-a")
        failed = runtime.status("course-a")
        self.assertEqual(failed.status, "failed")
        self.assertIn("exploded", failed.message)

        self.assertTrue(runtime.begin_build("course-a"))
        self.assertEqual(runtime.status("course-a").status, "building")
        runtime.run_build("course-a")
        self.assertEqual(runtime.status("course-a").status, "ready")
        self.assertEqual(indexer.build_calls[-1], ("course-a", True))

    def test_courses_are_independent_and_build_is_deduplicated(self) -> None:
        indexer = _FakeIndexer()
        runtime = CourseIndexRuntime(indexer)  # type: ignore[arg-type]
        indexer.failures["course-a"] = "A only"
        self.assertTrue(runtime.begin_build("course-a"))
        self.assertFalse(runtime.begin_build("course-a"))
        runtime.run_build("course-a")
        self.assertEqual(runtime.status("course-a").status, "failed")
        self.assertEqual(runtime.status("course-b").status, "missing")

    def test_require_ready_uses_structured_domain_error(self) -> None:
        runtime = CourseIndexRuntime(_FakeIndexer())  # type: ignore[arg-type]
        with self.assertRaises(CourseIndexNotReadyError) as caught:
            runtime.require_ready("course-a")
        self.assertEqual(
            caught.exception.to_detail()["code"], "course_index_not_ready"
        )


if __name__ == "__main__":
    unittest.main()
