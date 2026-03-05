import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api import router
from backend.doc_api import doc_router

# NOTE: 配置日志级别，确保项目模块的 INFO 日志可见
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="AstraMentor API", version="1.0.0")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
