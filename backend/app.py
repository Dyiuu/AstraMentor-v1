import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.api import router
from backend.doc_api import doc_router
from backend.course_api import course_router
from backend.session_api import session_router
from rag.errors import CourseIndexNotReadyError

# NOTE: 配置日志级别，确保项目模块的 INFO 日志可见
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="AstraMentor API", version="1.0.0")


@app.exception_handler(CourseIndexNotReadyError)
async def course_index_not_ready_handler(
    _request: Request, exc: CourseIndexNotReadyError
) -> JSONResponse:
    """Expose one stable recovery contract for all course-mode endpoints."""
    return JSONResponse(status_code=409, content={"detail": exc.to_detail()})

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.include_router(doc_router, prefix="/api/doc")
app.include_router(course_router, prefix="/api")
app.include_router(session_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
