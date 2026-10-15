from apps.api.routers.health import router as health_router
from apps.api.routers.auth import router as auth_router
from apps.api.routers.folders import router as folders_router
from apps.api.routers.sessions import router as sessions_router
from apps.api.routers.media import router as media_router
from apps.api.routers.transcripts import router as transcripts_router
from apps.api.routers.responses import router as responses_router
from apps.api.routers.analysis import router as analysis_router

__all__ = [
    "health_router",
    "auth_router",
    "folders_router",
    "sessions_router",
    "media_router",
    "transcripts_router",
    "responses_router",
    "analysis_router",
]
