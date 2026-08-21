"""Single-process coordination for course index build state."""

from __future__ import annotations

from threading import RLock

from rag.errors import CourseIndexNotReadyError
from rag.indexer import CourseIndexer, IndexStatus


class CourseIndexRuntime:
    """Merge durable index state with in-process building/failed state.

    The MVP runs one Uvicorn worker.  The lock prevents duplicate builds in
    that process; sharing state across multiple workers intentionally remains
    outside this file-backed MVP.
    """

    def __init__(self, indexer: CourseIndexer | None = None) -> None:
        self.indexer = indexer or CourseIndexer()
        self.registry = self.indexer.registry
        self._lock = RLock()
        self._building: set[str] = set()
        self._failed: dict[str, str] = {}
        self._pending_force: dict[str, bool] = {}

    def status(self, course_id: str) -> IndexStatus:
        disk_status = self.indexer.status(course_id)
        with self._lock:
            if course_id in self._building:
                return IndexStatus(
                    "building",
                    course_id,
                    chunk_count=disk_status.chunk_count,
                    message="课程索引正在构建",
                    built_at=disk_status.built_at,
                )
            failure = self._failed.get(course_id)
            if failure is not None:
                return IndexStatus(
                    "failed",
                    course_id,
                    chunk_count=disk_status.chunk_count,
                    message=failure,
                    built_at=disk_status.built_at,
                )
        return disk_status

    def begin_build(self, course_id: str, force: bool = False) -> bool:
        disk_status = self.indexer.status(course_id)
        with self._lock:
            if course_id in self._building:
                return False
            had_failure = course_id in self._failed
            if disk_status.status == "ready" and not force and not had_failure:
                return False
            self._failed.pop(course_id, None)
            self._building.add(course_id)
            # A failed retry must rebuild even if a complete old manifest is
            # still present on disk.
            self._pending_force[course_id] = bool(force or had_failure)
            return True

    def run_build(self, course_id: str, force: bool = False) -> IndexStatus:
        with self._lock:
            effective_force = bool(
                force or self._pending_force.pop(course_id, False)
            )
            self._building.add(course_id)
        try:
            result = self.indexer.build(course_id, force=effective_force)
            if result.status != "ready":
                raise RuntimeError(result.message or "课程索引构建未完成")
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            with self._lock:
                self._failed[course_id] = message
            return IndexStatus("failed", course_id, message=message)
        else:
            with self._lock:
                self._failed.pop(course_id, None)
            return result
        finally:
            with self._lock:
                self._building.discard(course_id)
                self._pending_force.pop(course_id, None)

    def require_ready(self, course_id: str) -> IndexStatus:
        current = self.status(course_id)
        if current.status != "ready":
            raise CourseIndexNotReadyError(
                course_id,
                current.status,
                current.message or "课程索引尚未就绪",
            )
        return current


course_runtime = CourseIndexRuntime()
