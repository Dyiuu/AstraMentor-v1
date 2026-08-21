"""Persistent learning-session endpoints used by the homepage history rail."""

from fastapi import APIRouter, HTTPException, Query, status

from backend.models import SessionSnapshotRequest
from services.session_repository import (
    InvalidSessionId,
    SessionNotFound,
    SessionRepository,
)


session_router = APIRouter(prefix="/sessions", tags=["sessions"])
repository = SessionRepository()


@session_router.get("")
async def list_sessions(limit: int = Query(default=6, ge=1, le=100)) -> dict:
    return {"sessions": repository.list(limit=limit)}


@session_router.get("/{session_id}")
async def get_session(session_id: str) -> dict:
    try:
        return repository.get(session_id)
    except InvalidSessionId as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="learning session not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@session_router.put("/{session_id}")
async def save_session(session_id: str, request: SessionSnapshotRequest) -> dict:
    if request.session_id != session_id:
        raise HTTPException(status_code=422, detail="path and payload session ids must match")
    try:
        return repository.save(session_id, request.model_dump(mode="json"))
    except InvalidSessionId as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@session_router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str) -> None:
    try:
        repository.delete(session_id)
    except InvalidSessionId as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SessionNotFound as exc:
        raise HTTPException(status_code=404, detail="learning session not found") from exc
