import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apps.api.core.config import settings
from apps.api.core.database import check_database_connection
from apps.api.routers import (
    health_router,
    auth_router,
    folders_router,
    sessions_router,
    media_router,
    transcripts_router,
    responses_router,
    analysis_router,
)

logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("decisionlens")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    logger.info("Initializing DecisionLens API...")
    Path(settings.AUDIO_TEMP_DIR).mkdir(parents=True, exist_ok=True)
    Path("./data/audio_uploads").mkdir(parents=True, exist_ok=True)
    db_check = check_database_connection()
    logger.info(f"Database connection verified: {db_check}")
    yield
    # Shutdown tasks
    logger.info("DecisionLens API shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Intelligent audio-driven decision analysis platform with Multi-Criteria Decision Analysis (MCDA) and SWOT frameworks.",
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(folders_router)
app.include_router(sessions_router)
app.include_router(media_router)
app.include_router(transcripts_router)
app.include_router(responses_router)
app.include_router(analysis_router)


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "docs_url": "/docs",
        "health_url": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "apps.api.main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG,
    )
