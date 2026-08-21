from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from services.session_repository import InvalidSessionId, SessionNotFound, SessionRepository


class SessionRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repository = SessionRepository(Path(self.temp_dir.name) / "sessions")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_save_list_get_and_delete(self) -> None:
        self.repository.save(
            "session_1",
            {
                "session_id": "session_1",
                "mode": "course",
                "title": "智能体课程",
                "selected_node": {"id": "node_2", "name": "感知模块"},
                "step_progress": {"current": 2, "total": 4},
                "average_mastery": 0.5,
            },
        )
        snapshot = self.repository.get("session_1")
        self.assertEqual(snapshot["title"], "智能体课程")
        summary = self.repository.list(limit=1)[0]
        self.assertEqual(summary["last_node_name"], "感知模块")
        self.assertEqual(summary["current_step"], 2)

        self.repository.delete("session_1")
        with self.assertRaises(SessionNotFound):
            self.repository.get("session_1")

    def test_latest_update_is_first(self) -> None:
        self.repository.save("older", {"session_id": "older", "title": "旧"})
        self.repository.save("newer", {"session_id": "newer", "title": "新"})
        self.assertEqual(self.repository.list()[0]["session_id"], "newer")

    def test_invalid_id_is_rejected(self) -> None:
        with self.assertRaises(InvalidSessionId):
            self.repository.save("../escape", {"session_id": "../escape"})

    def test_corrupt_snapshot_is_quarantined_without_hiding_siblings(self) -> None:
        self.repository.save("healthy", {"session_id": "healthy", "title": "正常"})
        bad_path = self.repository.root / "broken.json"
        bad_path.write_text("{not-json", encoding="utf-8")
        self.repository.index_path.write_text("{broken", encoding="utf-8")

        sessions = self.repository.list()
        self.assertEqual([item["session_id"] for item in sessions], ["healthy"])
        self.assertFalse(bad_path.exists())
        self.assertTrue(list(self.repository.root.glob("broken.corrupt.*")))

    def test_index_can_be_rebuilt(self) -> None:
        self.repository.save("one", {"session_id": "one", "title": "课程"})
        self.repository.index_path.unlink()
        sessions = self.repository.list()
        self.assertEqual(len(sessions), 1)
        data = json.loads(self.repository.index_path.read_text(encoding="utf-8"))
        self.assertEqual(data["schema_version"], 1)

    def test_course_identity_survives_snapshot_update_and_summary(self) -> None:
        first = self.repository.save(
            "course_session",
            {
                "session_id": "course_session",
                "mode": "course",
                "title": "Agent 开发工程师",
                "course_id": "agent-engineering",
                "course_title": "Agent 开发工程师",
            },
        )
        updated = self.repository.save(
            "course_session",
            {
                **first,
                "selected_node": {"id": "agent-loop", "name": "Agent 执行循环"},
            },
        )
        self.assertEqual(updated["course_id"], "agent-engineering")
        self.assertEqual(updated["course_title"], "Agent 开发工程师")
        summary = self.repository.list()[0]
        self.assertEqual(summary["course_id"], "agent-engineering")
        self.assertEqual(summary["course_title"], "Agent 开发工程师")


if __name__ == "__main__":
    unittest.main()
