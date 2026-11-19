import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, verify_ownership
from app.database import get_db
from app.models import Decision, User
from app.schemas import (
    RagAskRequest,
    RagAskResponse,
    RagCitation,
    RagQueryRequest,
    RagQueryResponse,
    RagReindexResponse,
    RagSearchResultItem,
    RagStatusResponse,
)
from app.services.rag.answer import answer_question
from app.services.rag.document_rag import get_document_rag_service

logger = logging.getLogger("decisionlens.api.rag")

router = APIRouter(prefix="/decisions/{decision_id}/rag", tags=["RAG & Knowledge Grounding"])
bulk_router = APIRouter(prefix="/rag", tags=["RAG & Knowledge Grounding"])


def _get_owned_decision(decision_id: int, db: Session, current_user: User) -> Decision:
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision {decision_id} not found",
        )
    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")
    return decision


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
    Search indexed decision attachments (Supabase pgvector when available).
    Returns top_k most relevant excerpts with scores and source attribution.
    """
    _get_owned_decision(decision_id, db, current_user)

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
                id=str(r.get("id", "chunk")),
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


@router.post(
    "/ask",
    response_model=RagAskResponse,
    summary="Ask a question and get an answer grounded in the decision's documents, with citations",
)
def ask_decision_documents(
    decision_id: int,
    body: RagAskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    decision = _get_owned_decision(decision_id, db, current_user)
    result = answer_question(
        decision_id=decision_id,
        question=body.question,
        decision_title=decision.title or "",
        top_k=body.top_k,
        domain=decision.domain,
    )
    return RagAskResponse(
        decision_id=decision_id,
        question=body.question,
        answer=result["answer"],
        covered=result["covered"],
        citations=[RagCitation(**c) for c in result["citations"]],
        documents_used=result["documents_used"],
        documents_indexed=result["documents_indexed"],
        engine=result["engine"],
        embedding_model=result["embedding_model"],
        semantic=result["semantic"],
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
    _get_owned_decision(decision_id, db, current_user)
    info = get_document_rag_service().get_index_status(decision_id)
    return RagStatusResponse(
        decision_id=decision_id,
        has_indexed_documents=info["chunk_count"] > 0,
        chunk_count=info["chunk_count"],
        storage_engine=info["storage_engine"],
        document_count=info["document_count"],
        embedding_model=info["embedding_model"],
        semantic=info["semantic"],
        stale_chunks=info["stale_chunks"],
    )


@router.post(
    "/reindex",
    response_model=RagReindexResponse,
    summary="Rebuild the document index for one decision",
)
def reindex_decision_documents(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_decision(decision_id, db, current_user)
    rag_service = get_document_rag_service()
    chunks = rag_service.reindex_decision(decision_id, db=db)
    preferred = rag_service.embedding_engine.preferred_model_id()
    return RagReindexResponse(
        decisions_reindexed=1,
        chunk_count=chunks,
        embedding_model=preferred,
        semantic=rag_service.embedding_engine.is_semantic(preferred),
    )


@bulk_router.post(
    "/reindex",
    response_model=RagReindexResponse,
    summary="Rebuild the document index for all of your decisions (run once after enabling embeddings)",
)
def reindex_all_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rag_service = get_document_rag_service()
    decision_ids = [
        row[0] for row in db.query(Decision.id).filter(Decision.owner_id == current_user.id).all()
    ]
    total_chunks = 0
    done = 0
    failed = []
    for dec_id in decision_ids:
        try:
            total_chunks += rag_service.reindex_decision(dec_id, db=db)
            done += 1
        except Exception as exc:
            logger.warning("Re-index failed for decision %s: %s", dec_id, exc)
            failed.append(dec_id)
    preferred = rag_service.embedding_engine.preferred_model_id()
    return RagReindexResponse(
        decisions_reindexed=done,
        chunk_count=total_chunks,
        embedding_model=preferred,
        semantic=rag_service.embedding_engine.is_semantic(preferred),
        failed_decision_ids=failed,
    )
