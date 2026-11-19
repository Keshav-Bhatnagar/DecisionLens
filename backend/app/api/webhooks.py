"""
Webhooks API for GitOps and Enterprise Knowledge Base Synchronization.

Provides secure, authenticated endpoints for automated CI/CD pipelines (e.g., GitHub Actions,
GitLab CI, or Notion/Confluence webhooks) to trigger immediate vector knowledge re-indexing
when enterprise guidelines or compliance documents change.
"""

import hmac
import logging
import time
from typing import Dict, Any, List
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings
from app.services.rag.domain_rag import get_domain_rag_service

logger = logging.getLogger("decisionlens.api.webhooks")

router = APIRouter(prefix="/webhooks", tags=["Webhooks & GitOps"])

# Rate-limiting memory to prevent DoS attacks on vector re-indexing (Rakshak guardrail)
_last_sync_timestamp: float = 0.0
RATE_LIMIT_COOLDOWN_SECONDS = 10.0


class WebhookSyncResponse(BaseModel):
    status: str = Field(..., description="Synchronization status, e.g. 'synchronized'")
    message: str = Field(..., description="Human-readable summary of the sync operation")
    domains_reindexed: List[str] = Field(default_factory=list, description="List of domain collections re-indexed")
    timestamp: float = Field(default_factory=time.time)


@router.post(
    "/rag-sync",
    response_model=WebhookSyncResponse,
    summary="Trigger GitOps Hot-Reload of Domain Knowledge Bases (Authenticated via Secret)",
    responses={
        200: {"description": "Knowledge bases successfully re-indexed into vector store."},
        401: {"description": "Missing or invalid X-Webhook-Secret header."},
        429: {"description": "Rate limit exceeded. Please wait between sync invocations."},
    },
)
def trigger_rag_knowledge_sync(
    x_webhook_secret: str = Header(None, alias="X-Webhook-Secret"),
) -> WebhookSyncResponse:
    """
    Automated GitOps Webhook Endpoint.

    Called by CI/CD workflows when files in `backend/app/data/domain_knowledge/` are modified.
    - Constant-time secret comparison against `settings.webhook_secret` (prevents timing attacks).
    - Rate-limited to prevent DoS / token exhaustion.
    - Forces immediate hot-reload of all domain vector collections.
    """
    global _last_sync_timestamp

    configured_secret = settings.webhook_secret.strip()
    if not configured_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook synchronization is not configured on this server.",
        )

    # 1. Security Check: Constant-time authentication check (Rakshak guardrail)
    if not x_webhook_secret or not hmac.compare_digest(x_webhook_secret.strip(), configured_secret):
        logger.warning("Unauthorized webhook access attempt rejected on /api/webhooks/rag-sync")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Webhook-Secret header.",
        )

    # 2. Rate-Limit Check: Protect embeddings budget & prevent DoS
    now = time.time()
    if (now - _last_sync_timestamp) < RATE_LIMIT_COOLDOWN_SECONDS:
        remaining = int(RATE_LIMIT_COOLDOWN_SECONDS - (now - _last_sync_timestamp))
        logger.info(f"Rate limiting webhook sync. Cooldown active for {remaining}s.")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. A knowledge sync was executed recently. Please wait {remaining} seconds.",
        )

    # 3. Execute Vector Knowledge Base Hot-Reload
    try:
        domain_service = get_domain_rag_service()
        domain_service.initialize_knowledge_bases(force=True)
        _last_sync_timestamp = now

        domains = [
            "business",
            "legal",
            "software",
            "real_estate",
            "finance",
            "product",
            "operations",
            "career",
        ]

        logger.info(f"GitOps Webhook successfully re-indexed {len(domains)} domain knowledge bases.")
        return WebhookSyncResponse(
            status="synchronized",
            message=f"Successfully re-indexed {len(domains)} domain knowledge bases into vector store.",
            domains_reindexed=domains,
            timestamp=now,
        )
    except Exception as exc:
        logger.error(f"Webhook knowledge sync failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to synchronize domain knowledge bases: {str(exc)}",
        )
