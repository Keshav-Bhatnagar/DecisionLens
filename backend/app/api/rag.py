from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Decision
from app.auth import get_current_user, verify_ownership
from app.schemas import (
    RagQueryRequest,
    RagQueryResponse,
    RagSearchResultItem,
    RagStatusResponse,
)
from app.services.rag.document_rag import get_document_rag_service

logger = logging.getLogger("decisionlens.api.rag")

router = APIRouter(prefix="/decisions/{decision_id}/rag", tags=["RAG & Knowledge Grounding"])


@router.post(
    "/query",
    response_model=RagQueryResponse,
    summary="Semantic vector search across decision documents",
)
def query_decision_documents(
    decision_id: int,
    body: RagQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Search indexed decision attachments using Supabase pgvector.
    Returns top_k most semantically relevant excerpts with confidence scores and source attribution.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision {decision_id} not found",
        )
    verify_ownership(decision, current_user)

    rag_service = get_document_rag_service()
    raw_results = rag_service.retrieve_relevant_excerpts(
        decision_id=decision_id,
        query=body.query,
        top_k=body.top_k,
    )

    items = []
    for r in raw_results:
        meta = r.get("metadata", {}) or {}
        items.append(
            RagSearchResultItem(
                id=r.get("id", "chunk"),
                content=r.get("content", ""),
                score=r.get("score", 0.0),
                document_name=meta.get("document_name") or "Attached Document",
                metadata=meta,
            )
        )

    return RagQueryResponse(
        decision_id=decision_id,
        query=body.query,
        count=len(items),
        results=items,
    )


@router.get(
    "/status",
    response_model=RagStatusResponse,
    summary="Get RAG indexing status and chunk count for a decision",
)
def get_decision_rag_status(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Check if attachments for this decision are indexed in Supabase pgvector.
    Returns total chunk count and storage engine information.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision {decision_id} not found",
        )
    verify_ownership(decision, current_user)

    rag_service = get_document_rag_service()
    has_docs = rag_service.has_indexed_documents(decision_id=decision_id)
    chunk_count = rag_service.get_chunk_count(decision_id=decision_id)

    return RagStatusResponse(
        decision_id=decision_id,
        has_indexed_documents=has_docs,
        chunk_count=chunk_count,
        storage_engine="supabase_pgvector" if rag_service._is_pg_available() else "in_memory_vector_store",
    )

