from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend.api import get_service
from rag.errors import CourseIndexNotReadyError
from services.learning_service import LearningService


class _Registry:
    def get(self, course_id: str):
        if course_id != "demo":
            raise KeyError(f"course not found: {course_id}")
        return object()


class _Runtime:
    def __init__(self, status: str) -> None:
        self.registry = _Registry()
        self.status = status
        self.ready_calls = 0

    def require_ready(self, course_id: str):
        self.ready_calls += 1
        if self.status != "ready":
            raise CourseIndexNotReadyError(course_id, self.status, "not ready")
        return object()


class CourseModeGuardTests(unittest.TestCase):
    def test_non_ready_course_never_constructs_learning_service(self) -> None:
        for status in ("missing", "stale", "building", "failed"):
            with self.subTest(status=status):
                runtime = _Runtime(status)
                with patch("backend.api.course_runtime", runtime), patch(
                    "backend.api.LearningService"
                ) as service_class:
                    with self.assertRaises(CourseIndexNotReadyError) as caught:
                        get_service("topic", "demo", require_course_index=True)
                    self.assertEqual(caught.exception.status, status)
                    service_class.assert_not_called()

    def test_state_only_course_access_validates_identity_without_ready_guard(self) -> None:
        runtime = _Runtime("failed")
        with patch("backend.api.course_runtime", runtime), patch(
            "backend.api.LearningService", return_value=Mock()
        ) as service_class:
            get_service("topic", "demo", require_course_index=False)
        self.assertEqual(runtime.ready_calls, 0)
        service_class.assert_called_once_with(topic="topic", course_id="demo")

    def test_unknown_course_is_404_before_any_service_or_path(self) -> None:
        runtime = _Runtime("ready")
        with patch("backend.api.course_runtime", runtime), patch(
            "backend.api.LearningService"
        ) as service_class:
            with self.assertRaises(HTTPException) as caught:
                get_service("../../topic", "../escape", require_course_index=True)
        self.assertEqual(caught.exception.status_code, 404)
        service_class.assert_not_called()

    def test_ready_empty_retrieval_is_explicit_extension(self) -> None:
        service = LearningService.__new__(LearningService)
        service.course_id = "demo"
        service.retriever = Mock()
        service.retriever.search.return_value = []
        service.last_citations = []
        service.last_knowledge_scope = "course"
        context, citations = service._course_evidence("不存在的教材问题")
        self.assertEqual((context, citations), ("", []))
        self.assertEqual(service.last_knowledge_scope, "extension")


if __name__ == "__main__":
    unittest.main()
