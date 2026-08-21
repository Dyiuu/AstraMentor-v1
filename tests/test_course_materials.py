from __future__ import annotations

import json
from pathlib import Path
import re
import unittest

from rag.content_validator import validate_course
from rag.course_registry import CourseRegistry


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "course_project_coverage.json"
COURSE_IDS = (
    "llm-app-development",
    "rag-knowledge-engineering",
    "agent-engineering",
    "ai-app-production",
)


class CourseMaterialsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.registry = CourseRegistry()
        cls.coverage = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_four_course_manifests_register_eight_projects_each(self) -> None:
        for expected_order, course_id in zip((20, 30, 40, 50), COURSE_IDS):
            with self.subTest(course_id=course_id):
                course = self.registry.get(course_id)
                self.assertEqual(course.order, expected_order)
                self.assertEqual(course.hours, 32)
                self.assertEqual(len(course.materials), 8)
                self.assertEqual(len({item.id for item in course.materials}), 8)
                for material in course.materials:
                    self.assertTrue(material.path.is_file())
                    self.assertEqual(material.path.suffix.lower(), ".md")
                    self.assertTrue(material.relative_path.startswith("materials/"))
                    material.path.resolve().relative_to(course.root.resolve())

    def test_every_material_passes_vocational_content_validator(self) -> None:
        for course_id in COURSE_IDS:
            with self.subTest(course_id=course_id):
                issues = validate_course(course_id, self.registry)
                self.assertEqual(
                    issues,
                    [],
                    "\n".join(f"{item.path}: {item.code}: {item.message}" for item in issues),
                )

    def test_coverage_fixture_has_one_complete_contract_per_project(self) -> None:
        expected = {
            (course.id, material.id)
            for course_id in COURSE_IDS
            for course in (self.registry.get(course_id),)
            for material in course.materials
        }
        actual = {(row["course_id"], row["material_id"]) for row in self.coverage}
        self.assertEqual(len(self.coverage), 32)
        self.assertEqual(actual, expected)
        self.assertEqual(len(actual), len(self.coverage))
        required = {
            "job_task",
            "input",
            "output",
            "acceptance_evidence",
            "fault_cases",
            "required_topics",
        }
        for row in self.coverage:
            with self.subTest(course_id=row["course_id"], material_id=row["material_id"]):
                self.assertEqual(row["duration_minutes"], 240)
                self.assertTrue(required.issubset(row))
                for field in required - {"fault_cases", "required_topics"}:
                    self.assertIsInstance(row[field], str)
                    self.assertTrue(row[field].strip())
                self.assertGreaterEqual(len(row["fault_cases"]), 2)
                self.assertGreaterEqual(len(row["required_topics"]), 2)

    def test_required_topics_are_present_in_the_assigned_material(self) -> None:
        by_pair = {
            (row["course_id"], row["material_id"]): row for row in self.coverage
        }
        for course_id in COURSE_IDS:
            course = self.registry.get(course_id)
            for material in course.materials:
                markdown = material.path.read_text(encoding="utf-8")
                normalized = re.sub(r"\s+", "", markdown).lower()
                contract = by_pair[(course_id, material.id)]
                for topic in contract["required_topics"]:
                    with self.subTest(
                        course_id=course_id, material_id=material.id, topic=topic
                    ):
                        self.assertIn(re.sub(r"\s+", "", topic).lower(), normalized)


if __name__ == "__main__":
    unittest.main()
