"""Course catalog, indexing and retrieval endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Response, status

from backend.course_runtime import course_runtime
from backend.models import CourseSearchRequest
from rag.citations import citation_from_result
from rag.retriever import CourseRetriever


course_router = APIRouter(prefix="/courses", tags=["courses"])
registry = course_runtime.registry
indexer = course_runtime.indexer


def _course_payload(course_id: str) -> dict:
    course = registry.get(course_id)
    index_status = course_runtime.status(course_id).to_dict()
    return {**course.to_dict(), "index": index_status}


@course_router.get("")
async def list_courses() -> dict:
    registry.refresh()
    return {
        "courses": [_course_payload(course.id) for course in registry.list_courses()],
        "invalid_courses": registry.errors(),
        "course_warnings": registry.warnings(),
    }


@course_router.get("/{course_id}")
async def get_course(course_id: str) -> dict:
    try:
        return _course_payload(course_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "course_not_found", "message": str(exc)},
        ) from exc


@course_router.post("/{course_id}/index", status_code=status.HTTP_202_ACCEPTED)
async def build_course_index(
    course_id: str,
    background_tasks: BackgroundTasks,
    response: Response,
    force: bool = False,
) -> dict:
    try:
        current = course_runtime.status(course_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "course_not_found", "message": str(exc)},
        ) from exc
    if current.status == "ready" and not force:
        response.status_code = status.HTTP_200_OK
        return current.to_dict()
    scheduled = course_runtime.begin_build(course_id, force=force)
    if scheduled:
        background_tasks.add_task(course_runtime.run_build, course_id, force)
    runtime_status = course_runtime.status(course_id)
    if runtime_status.status == "ready":
        response.status_code = status.HTTP_200_OK
    return runtime_status.to_dict()


@course_router.post("/{course_id}/search")
async def search_course(course_id: str, request: CourseSearchRequest) -> dict:
    try:
        course_runtime.require_ready(course_id)
        retriever = CourseRetriever(course_id, registry=registry, auto_build=False)
        results = retriever.search(request.query, top_k=request.top_k)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "course_not_found", "message": str(exc)},
        ) from exc
    return {
        "course_id": course_id,
        "query": request.query,
        "results": [
            {**result.to_dict(), "citation": citation_from_result(result)}
            for result in results
        ],
    }
