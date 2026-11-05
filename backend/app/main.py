from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.database import init_db
from app.api.auth import router as auth_router
from app.api.folders import router as folders_router
from app.api.decisions import router as decisions_router
from app.api.uploads import router as uploads_router
from app.api.transcription import router as transcription_router
from app.api.structuring import router as structuring_router
from app.api.gaps import router as gaps_router
from app.api.analysis import router as analysis_router
from app.api.roadmap import router as roadmap_router
from app.api.outcomes import router as outcomes_router
from app.api.rag import router as rag_router


# Lifespan context manager for application initialization and teardown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure storage directory exists
    try:
        _ = settings.storage_path
    except Exception as exc:
        logger.warning(f"Could not prepare storage directory: {exc}")
    # Initialize database tables and execute incremental SQLite migrations
    try:
        init_db()
    except Exception as exc:
        logger.error(f"init_db failed during lifespan: {exc}")
    yield
    # Cleanly dispose database engine on shutdown to prevent Uvicorn hanging on reload
    try:
        from app.database import engine
        engine.dispose()
    except Exception as exc:
        logger.warning(f"Error disposing database engine: {exc}")


app = FastAPI(
    title=settings.project_name,
    debug=settings.debug,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Configure CORS for frontend connectivity
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|.*\.trycloudflare\.com)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


import logging
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError

logger = logging.getLogger("decisionlens.main")


def _cors_headers_for(request: Request, extra_headers=None):
    headers = dict(extra_headers) if extra_headers else {}
    origin = request.headers.get("origin")
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = "*"
        headers["Access-Control-Allow-Headers"] = "*"
    return headers


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=_cors_headers_for(request, getattr(exc, "headers", None)),
    )


from fastapi.encoders import jsonable_encoder


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors())},
        headers=_cors_headers_for(request),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled server exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc) if settings.debug else "An unexpected error occurred",
        },
        headers=_cors_headers_for(request),
    )


# Mount API routers
app.include_router(auth_router, prefix="/api")
app.include_router(folders_router, prefix="/api")
app.include_router(decisions_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(transcription_router, prefix="/api")
app.include_router(structuring_router, prefix="/api")
app.include_router(gaps_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(roadmap_router, prefix="/api")
app.include_router(outcomes_router, prefix="/api")
app.include_router(rag_router, prefix="/api")


@app.get("/", tags=["General"])
async def root():
    return {
        "message": f"Welcome to {settings.project_name}",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "project": settings.project_name,
        "environment": settings.environment,
        "version": "1.0.0",
        "storage_ready": settings.storage_path.is_dir(),
    }
