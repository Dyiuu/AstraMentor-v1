from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import app
from backend.course_runtime import CourseIndexRuntime
from rag.course_registry import CourseRegistry
from rag.indexer import CourseIndexer


def _write_course(root: Path, course_id: str = "demo") -> None:
    course_root = root / "courses" / course_id
    material_root = course_root / "materials"
    material_root.mkdir(parents=True)
    (material_root / "book.md").write_text(
        "# Agent 工程\n\n## 工具契约\n\n工具参数必须经过校验。",
        encoding="utf-8",
    )
    (course_root / "course.yaml").write_text(
        json.dumps(
            {
                "id": course_id,
                "title": "Agent 开发工程师",
                "order": 40,
                "hours": 32,
                "level": "advanced",
                "track": "AI 应用工程",
                "prerequisite_skills": ["Python"],
                "recommended_courses": ["not-installed"],
                "job_roles": ["Agent 开发工程师"],
                "competencies": ["开发可靠工具"],
                "capstone": "职业学习助理",
                "tags": ["Agent"],
                "materials": [
                    {"id": "book", "title": "教材", "path": "materials/book.md"}
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


class CourseApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        _write_course(root)
        registry = CourseRegistry(root / "courses", root / "indexes")
        self.runtime = CourseIndexRuntime(CourseIndexer(registry))
        self.patchers = [
            patch("backend.course_api.course_runtime", self.runtime),
            patch("backend.course_api.registry", registry),
            patch("backend.course_api.indexer", self.runtime.indexer),
        ]
        for patcher in self.patchers:
            patcher.start()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temp.cleanup()

    def test_list_exposes_metadata_errors_and_warnings(self) -> None:
        response = self.client.get("/api/courses")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("invalid_courses", payload)
        self.assertIn("demo", payload["course_warnings"])
        course = payload["courses"][0]
        self.assertEqual(course["hours"], 32)
        self.assertEqual(course["job_roles"], ["Agent 开发工程师"])

    def test_build_poll_ready_and_ready_build_returns_200(self) -> None:
        started = self.client.post("/api/courses/demo/index")
        self.assertEqual(started.status_code, 202)
        self.assertEqual(started.json()["status"], "building")
        current = self.client.get("/api/courses/demo")
        self.assertEqual(current.json()["index"]["status"], "ready")
        unchanged = self.client.post("/api/courses/demo/index")
        self.assertEqual(unchanged.status_code, 200)

    def test_non_ready_search_has_stable_409_and_unknown_is_404(self) -> None:
        response = self.client.post(
            "/api/courses/demo/search", json={"query": "工具契约"}
        )
        self.assertEqual(response.status_code, 409)
        detail = response.json()["detail"]
        self.assertEqual(detail["code"], "course_index_not_ready")
        self.assertEqual(detail["course_id"], "demo")
        self.assertEqual(detail["status"], "missing")
        self.assertTrue(detail["message"])

        missing = self.client.get("/api/courses/not-found")
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
