"""
DecisionLens RAG (Retrieval-Augmented Generation) Subsystem.
Provides modular, two-tier vector retrieval:
1. Document RAG: User private uploaded documents (BYOC).
2. Domain RAG: Curated domain standards (Career, Legal, Software).
"""

from app.services.rag.chunking import TextChunker, TextChunk
from app.services.rag.embeddings import EmbeddingEngine, get_embedding_engine
from app.services.rag.vector_store import InMemoryVectorStore, get_vector_store
from app.services.rag.router import DomainRouter, DomainType, classify_decision_domain
from app.services.rag.domain_rag import DomainRAGService, get_domain_rag_service
from app.services.rag.document_rag import DocumentRAGService, get_document_rag_service

__all__ = [
    "TextChunker",
    "TextChunk",
    "EmbeddingEngine",
    "get_embedding_engine",
    "InMemoryVectorStore",
    "get_vector_store",
    "DomainRouter",
    "DomainType",
    "classify_decision_domain",
    "DomainRAGService",
    "get_domain_rag_service",
    "DocumentRAGService",
    "get_document_rag_service",
]
