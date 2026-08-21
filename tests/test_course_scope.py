from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from services.learning_service import LearningService


class CourseScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "test_data"
        self.root_patch = patch.object(LearningService, "TEST_DATA_ROOT", self.root)
        self.root_patch.start()
        self.api_patch = patch("services.learning_service.APIClient", return_value=Mock())
        self.api_patch.start()

    def tearDown(self) -> None:
        self.api_patch.stop()
        self.root_patch.stop()
        self.temp.cleanup()

    def test_same_topic_is_isolated_by_course_for_graph_and_state(self) -> None:
        first = LearningService(topic="共享主题", course_id="course-a")
        second = LearningService(topic="共享主题", course_id="course-b")
        self.assertNotEqual(first._graph_file("共享主题"), second._graph_file("共享主题"))
        self.assertNotEqual(first._state_file("共享主题"), second._state_file("共享主题"))

        self.assertTrue(first.save_graph("共享主题", {"course": "A"}))
        self.assertTrue(second.save_graph("共享主题", {"course": "B"}))
        self.assertEqual(first.load_graph("共享主题"), {"course": "A"})
        self.assertEqual(second.load_graph("共享主题"), {"course": "B"})
        first.delete_graph("共享主题")
        self.assertIsNone(first.load_graph("共享主题"))
        self.assertEqual(second.load_graph("共享主题"), {"course": "B"})

    def test_malicious_topic_cannot_escape_data_root(self) -> None:
        service = LearningService(topic="../../outside\\drive:C:", course_id="course-a")
        for path in (
            service._graph_file("../../outside\\drive:C:"),
            service._state_file("../../outside\\drive:C:"),
        ):
            path.resolve().relative_to(self.root.resolve())
        self.assertTrue(service.save_graph("../../outside\\drive:C:", {"safe": True}))
        self.assertFalse((Path(self.temp.name) / "outside.json").exists())

    def test_invalid_course_id_is_rejected_before_state_file_creation(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid course id"):
            LearningService(topic="topic", course_id="../escape")
        self.assertFalse(self.root.exists())


if __name__ == "__main__":
    unittest.main()
