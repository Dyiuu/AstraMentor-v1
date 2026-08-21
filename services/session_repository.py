"""File-backed learning session snapshots with atomic writes."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from typing import Any
from uuid import uuid4


SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class InvalidSessionId(ValueError):
    """Raised when a session id could escape or confuse the storage layout."""


class SessionNotFound(KeyError):
    """Raised when a requested learning session does not exist."""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionRepository:
    """Persist full snapshots separately from the lightweight homepage index."""

    def __init__(self, root: Path | str = Path("user_data") / "sessions") -> None:
        self.root = Path(root)
        self.index_path = self.root / "index.json"

    @staticmethod
    def validate_session_id(session_id: str) -> str:
        if not SESSION_ID_PATTERN.fullmatch(session_id):
            raise InvalidSessionId(
                "session_id must contain only letters, numbers, hyphens or underscores"
            )
        return session_id

    def _session_path(self, session_id: str) -> Path:
        return self.root / f"{self.validate_session_id(session_id)}.json"

    def _atomic_write(self, path: Path, value: Any) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        temp_path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temp_path, path)

    def _quarantine(self, path: Path) -> None:
        suffix = datetime.now().strftime("%Y%m%d%H%M%S")
        target = path.with_suffix(f".corrupt.{suffix}")
        try:
            os.replace(path, target)
        except OSError:
            pass

    @staticmethod
    def _summary(snapshot: dict[str, Any]) -> dict[str, Any]:
        selected = snapshot.get("selected_node") or {}
        progress = snapshot.get("step_progress") or {}
        return {
            "session_id": snapshot["session_id"],
            "mode": snapshot.get("mode", "topic"),
            "title": snapshot.get("title") or snapshot.get("internal_topic") or "未命名学习",
            "course_id": snapshot.get("course_id"),
            "course_title": snapshot.get("course_title"),
            "last_node_id": selected.get("id"),
            "last_node_name": selected.get("name"),
            "current_step": progress.get("current"),
            "total_steps": progress.get("total"),
            "average_mastery": float(snapshot.get("average_mastery") or 0.0),
            "created_at": snapshot.get("created_at") or snapshot.get("updated_at"),
            "updated_at": snapshot.get("updated_at"),
        }

    def _read_json(self, path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            self._quarantine(path)
            raise ValueError(f"corrupt session file: {path.name}") from exc

    def _rebuild_index(self) -> list[dict[str, Any]]:
        self.root.mkdir(parents=True, exist_ok=True)
        summaries: list[dict[str, Any]] = []
        for path in self.root.glob("*.json"):
            if path == self.index_path:
                continue
            try:
                snapshot = self._read_json(path)
                if isinstance(snapshot, dict) and snapshot.get("session_id"):
                    summaries.append(self._summary(snapshot))
            except ValueError:
                continue
        summaries.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
        self._atomic_write(self.index_path, {"schema_version": 1, "sessions": summaries})
        return summaries

    def list(self, limit: int | None = None) -> list[dict[str, Any]]:
        if not self.index_path.exists():
            summaries = self._rebuild_index()
        else:
            try:
                data = self._read_json(self.index_path)
                summaries = data.get("sessions", []) if isinstance(data, dict) else []
            except ValueError:
                summaries = self._rebuild_index()
        summaries = sorted(
            (item for item in summaries if isinstance(item, dict)),
            key=lambda item: item.get("updated_at") or "",
            reverse=True,
        )
        return summaries[:limit] if limit is not None else summaries

    def get(self, session_id: str) -> dict[str, Any]:
        path = self._session_path(session_id)
        if not path.exists():
            raise SessionNotFound(session_id)
        snapshot = self._read_json(path)
        if not isinstance(snapshot, dict):
            raise ValueError(f"invalid session snapshot: {session_id}")
        return snapshot

    def save(self, session_id: str, snapshot: dict[str, Any]) -> dict[str, Any]:
        session_id = self.validate_session_id(session_id)
        now = _utc_now()
        existing_created_at: str | None = None
        path = self._session_path(session_id)
        if path.exists():
            try:
                existing_created_at = self.get(session_id).get("created_at")
            except (ValueError, SessionNotFound):
                existing_created_at = None
        stored = {
            **snapshot,
            "schema_version": int(snapshot.get("schema_version") or 1),
            "session_id": session_id,
            "created_at": snapshot.get("created_at") or existing_created_at or now,
            "updated_at": now,
        }
        self._atomic_write(path, stored)
        self._rebuild_index()
        return stored

    def delete(self, session_id: str) -> None:
        path = self._session_path(session_id)
        if not path.exists():
            raise SessionNotFound(session_id)
        path.unlink()
        self._rebuild_index()
