"""Domain errors shared by the course RAG and HTTP layers."""

from __future__ import annotations

from typing import Any


class CourseIndexNotReadyError(RuntimeError):
    """Raised when a course index cannot safely serve retrieval requests."""

    def __init__(self, course_id: str, status: str, message: str) -> None:
        self.course_id = course_id
        self.status = status
        self.message = message
        super().__init__(message)

    def to_detail(self) -> dict[str, Any]:
        return {
            "code": "course_index_not_ready",
            "course_id": self.course_id,
            "status": self.status,
            "message": self.message,
        }
