from __future__ import annotations

import json
from pathlib import Path
import tempfile
import threading
import unittest

from rag.course_registry import CourseRegistry


def _write_course(root: Path, course_id: str, **metadata) -> None:
    course_root = root / "courses" / course_id
    materials = course_root / "materials"
    materials.mkdir(parents=True)
    (materials / "book.md").write_text("# 课程\n\n有效内容。", encoding="utf-8")
    payload = {
        "id": course_id,
        "title": metadata.pop("title", course_id),
        "materials": [{"id": "book", "path": "materials/book.md"}],
        **metadata,
    }
    (course_root / "course.yaml").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )


class CourseRegistryMetadataTests(unittest.TestCase):
    def test_refresh_keeps_previous_snapshot_visible_while_parse_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _write_course(root, "stable", recommended_courses=["missing"])
            _write_course(root, "broken", order=-1)
            registry = CourseRegistry(root / "courses", root / "indexes")
            self.assertIn("broken", registry.errors())
            self.assertIn("stable", registry.warnings())

            original_parse = registry._parse_course
            parse_started = threading.Event()
            allow_parse = threading.Event()
            refresh_errors: list[BaseException] = []

            def blocking_parse(manifest: Path):
                parse_started.set()
                if not allow_parse.wait(timeout=2):
                    raise TimeoutError("test did not release the blocked parser")
                return original_parse(manifest)

            def run_refresh() -> None:
                try:
                    registry.refresh()
                except BaseException as exc:  # pragma: no cover - asserted below
                    refresh_errors.append(exc)

            registry._parse_course = blocking_parse  # type: ignore[method-assign]
            refresh_thread = threading.Thread(target=run_refresh)
            refresh_thread.start()
            self.assertTrue(parse_started.wait(timeout=1))
            try:
                self.assertEqual(registry.get("stable").id, "stable")
                self.assertEqual(
                    [course.id for course in registry.list_courses()], ["stable"]
                )
                self.assertIn("broken", registry.errors())
                self.assertIn("stable", registry.warnings())
                self.assertEqual(
                    registry.index_dir("stable"), root / "indexes" / "stable"
                )
            finally:
                allow_parse.set()
                refresh_thread.join(timeout=2)

            self.assertFalse(refresh_thread.is_alive())
            self.assertEqual(refresh_errors, [])

    def test_full_metadata_round_trips_as_json_arrays(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _write_course(
                root,
                "advanced-course",
                order=20,
                hours=32,
                level="advanced",
                track="AI 应用工程",
                prerequisite_skills=["Python", "HTTP"],
                recommended_courses=[],
                job_roles=["Agent 开发工程师"],
                competencies=["工具编排"],
                capstone="职业学习助理",
                tags=["Agent", "MCP"],
            )
            course = CourseRegistry(root / "courses", root / "indexes").get(
                "advanced-course"
            )
            self.assertIsInstance(course.tags, tuple)
            payload = course.to_dict()
            self.assertEqual(payload["hours"], 32)
            self.assertEqual(payload["prerequisite_skills"], ["Python", "HTTP"])
            self.assertEqual(payload["tags"], ["Agent", "MCP"])

    def test_legacy_defaults_and_order_then_title_sorting(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _write_course(root, "late", title="甲")
            _write_course(root, "early-z", title="乙", order=10)
            _write_course(root, "early-a", title="丁", order=10)
            registry = CourseRegistry(root / "courses", root / "indexes")
            legacy = registry.get("late")
            self.assertEqual((legacy.order, legacy.hours, legacy.level), (999, 0, "unspecified"))
            self.assertEqual(legacy.job_roles, ())
            self.assertEqual(
                [course.id for course in registry.list_courses()],
                ["early-a", "early-z", "late"],
            )

    def test_invalid_metadata_isolated_from_valid_sibling(self) -> None:
        invalid_values = [
            {"order": -1},
            {"hours": True},
            {"level": "expert"},
            {"tags": "Agent"},
            {"job_roles": [""]},
            {"competencies": [123]},
            {"recommended_courses": ["../escape"]},
        ]
        for index, invalid in enumerate(invalid_values):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                _write_course(root, "valid", order=1)
                _write_course(root, f"invalid-{index}", **invalid)
                registry = CourseRegistry(root / "courses", root / "indexes")
                self.assertEqual([course.id for course in registry.list_courses()], ["valid"])
                self.assertIn(f"invalid-{index}", registry.errors())

    def test_missing_recommendation_warns_and_refresh_clears_warning(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _write_course(root, "course-a", recommended_courses=["course-b"])
            registry = CourseRegistry(root / "courses", root / "indexes")
            self.assertIn("course-a", registry.warnings())
            _write_course(root, "course-b")
            registry.refresh()
            self.assertEqual(registry.warnings(), {})


if __name__ == "__main__":
    unittest.main()
