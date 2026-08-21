"""Discover and validate file-backed vocational courses."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import re
from pathlib import Path
from threading import RLock
from typing import Any, Iterable


COURSE_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
COURSE_LEVELS = {"foundation", "intermediate", "advanced", "unspecified"}


class CourseConfigError(ValueError):
    """Raised when a course manifest is malformed or unsafe."""


@dataclass(frozen=True)
class Material:
    id: str
    title: str
    path: Path
    relative_path: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["path"] = self.relative_path
        return data


@dataclass(frozen=True)
class Course:
    id: str
    title: str
    description: str
    locale: str
    version: str
    category: str
    order: int
    hours: int
    level: str
    track: str
    prerequisite_skills: tuple[str, ...]
    recommended_courses: tuple[str, ...]
    job_roles: tuple[str, ...]
    competencies: tuple[str, ...]
    capstone: str
    tags: tuple[str, ...]
    root: Path
    materials: tuple[Material, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "locale": self.locale,
            "version": self.version,
            "category": self.category,
            "order": self.order,
            "hours": self.hours,
            "level": self.level,
            "track": self.track,
            "prerequisite_skills": list(self.prerequisite_skills),
            "recommended_courses": list(self.recommended_courses),
            "job_roles": list(self.job_roles),
            "competencies": list(self.competencies),
            "capstone": self.capstone,
            "tags": list(self.tags),
            "materials": [material.to_dict() for material in self.materials],
        }


def _non_negative_integer(
    data: dict[str, Any], field: str, *, default: int
) -> int:
    value = data.get(field, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CourseConfigError(f"{field} must be a non-negative integer")
    return value


def _string_tuple(
    data: dict[str, Any], field: str, *, course_ids: bool = False
) -> tuple[str, ...]:
    value = data.get(field, [])
    if not isinstance(value, list):
        raise CourseConfigError(f"{field} must be an array of non-empty strings")
    parsed: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise CourseConfigError(f"{field} must be an array of non-empty strings")
        item = item.strip()
        if course_ids and not COURSE_ID_PATTERN.fullmatch(item):
            raise CourseConfigError(f"{field} contains an invalid course id: {item}")
        parsed.append(item)
    return tuple(parsed)


def _optional_string(data: dict[str, Any], field: str) -> str:
    value = data.get(field, "")
    if not isinstance(value, str):
        raise CourseConfigError(f"{field} must be a string")
    return value.strip()


def _load_manifest(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        try:
            import yaml  # type: ignore[import-not-found]
        except ImportError as exc:
            raise CourseConfigError(
                f"{path}: non-JSON YAML requires PyYAML (pip install PyYAML)"
            ) from exc
        data = yaml.safe_load(raw)
    if not isinstance(data, dict):
        raise CourseConfigError(f"{path}: course manifest must be an object")
    return data


class CourseRegistry:
    """A resilient registry: an invalid course never hides valid siblings."""

    def __init__(
        self,
        courses_root: Path | str | None = None,
        indexes_root: Path | str | None = None,
    ) -> None:
        rag_root = Path(__file__).resolve().parent
        self.courses_root = Path(courses_root or rag_root / "courses").resolve()
        self.indexes_root = Path(indexes_root or rag_root / "indexes").resolve()
        self._lock = RLock()
        self._courses: dict[str, Course] = {}
        self._errors: dict[str, str] = {}
        self._warnings: dict[str, list[str]] = {}
        self.refresh()

    def refresh(self) -> None:
        courses: dict[str, Course] = {}
        errors: dict[str, str] = {}
        warnings: dict[str, list[str]] = {}
        if self.courses_root.exists():
            # Build the next generation without touching the live snapshot.
            # Cross-course references are checked only after discovery so that
            # a missing optional prerequisite never hides a usable course.
            for manifest in sorted(self.courses_root.glob("*/course.yaml")):
                key = manifest.parent.name
                try:
                    course = self._parse_course(manifest)
                    if course.id in courses:
                        raise CourseConfigError(f"duplicate course id: {course.id}")
                    courses[course.id] = course
                except (CourseConfigError, OSError, ValueError) as exc:
                    errors[key] = str(exc)

        installed = set(courses)
        for course in courses.values():
            missing = [
                course_id
                for course_id in course.recommended_courses
                if course_id not in installed
            ]
            if missing:
                warnings[course.id] = [
                    f"recommended course is not installed: {course_id}"
                    for course_id in missing
                ]

        with self._lock:
            self._courses = courses
            self._errors = errors
            self._warnings = warnings

    def _parse_course(self, manifest: Path) -> Course:
        data = _load_manifest(manifest)
        course_id = str(data.get("id", "")).strip()
        if not COURSE_ID_PATTERN.fullmatch(course_id):
            raise CourseConfigError(
                f"{manifest}: id must contain lowercase letters, numbers and hyphens"
            )
        title = str(data.get("title", "")).strip()
        if not title:
            raise CourseConfigError(f"{manifest}: title is required")

        order = _non_negative_integer(data, "order", default=999)
        hours = _non_negative_integer(data, "hours", default=0)
        level = data.get("level", "unspecified")
        if not isinstance(level, str) or level not in COURSE_LEVELS:
            raise CourseConfigError(
                f"{manifest}: level must be one of {sorted(COURSE_LEVELS)}"
            )
        prerequisite_skills = _string_tuple(data, "prerequisite_skills")
        recommended_courses = _string_tuple(
            data, "recommended_courses", course_ids=True
        )
        job_roles = _string_tuple(data, "job_roles")
        competencies = _string_tuple(data, "competencies")
        tags = _string_tuple(data, "tags")

        course_root = manifest.parent.resolve()
        raw_materials = data.get("materials")
        if not isinstance(raw_materials, list) or not raw_materials:
            raise CourseConfigError(f"{manifest}: at least one material is required")

        materials: list[Material] = []
        material_ids: set[str] = set()
        for item in raw_materials:
            if not isinstance(item, dict):
                raise CourseConfigError(f"{manifest}: each material must be an object")
            material_id = str(item.get("id", "")).strip()
            relative_path = str(item.get("path", "")).strip().replace("\\", "/")
            if not material_id or material_id in material_ids:
                raise CourseConfigError(f"{manifest}: material ids must be unique")
            material_ids.add(material_id)
            material_path = (course_root / relative_path).resolve()
            try:
                material_path.relative_to(course_root)
            except ValueError as exc:
                raise CourseConfigError(
                    f"{manifest}: material path escapes course directory: {relative_path}"
                ) from exc
            if material_path.suffix.lower() != ".md" or not material_path.is_file():
                raise CourseConfigError(
                    f"{manifest}: Markdown material not found: {relative_path}"
                )
            materials.append(
                Material(
                    id=material_id,
                    title=str(item.get("title") or material_path.stem),
                    path=material_path,
                    relative_path=relative_path,
                )
            )

        return Course(
            id=course_id,
            title=title,
            description=str(data.get("description", "")).strip(),
            locale=str(data.get("locale", "zh-CN")).strip() or "zh-CN",
            version=str(data.get("version", "1.0")).strip() or "1.0",
            category=str(data.get("category", "")).strip(),
            order=order,
            hours=hours,
            level=level,
            track=_optional_string(data, "track"),
            prerequisite_skills=prerequisite_skills,
            recommended_courses=recommended_courses,
            job_roles=job_roles,
            competencies=competencies,
            capstone=_optional_string(data, "capstone"),
            tags=tags,
            root=course_root,
            materials=tuple(materials),
        )

    def list_courses(self) -> list[Course]:
        with self._lock:
            courses = tuple(self._courses.values())
        return sorted(
            courses, key=lambda course: (course.order, course.title)
        )

    def get(self, course_id: str) -> Course:
        with self._lock:
            try:
                return self._courses[course_id]
            except KeyError as exc:
                raise KeyError(f"course not found: {course_id}") from exc

    def errors(self) -> dict[str, str]:
        with self._lock:
            return dict(self._errors)

    def warnings(self) -> dict[str, list[str]]:
        with self._lock:
            return {key: list(value) for key, value in self._warnings.items()}

    def index_dir(self, course_id: str) -> Path:
        with self._lock:
            try:
                self._courses[course_id]
            except KeyError as exc:
                raise KeyError(f"course not found: {course_id}") from exc
            return self.indexes_root / course_id

    def iter_manifests(self) -> Iterable[Path]:
        return self.courses_root.glob("*/course.yaml")
