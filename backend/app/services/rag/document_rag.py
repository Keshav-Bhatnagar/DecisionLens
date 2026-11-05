import json
from typing import Any, Dict, List, Optional
import logging
from sqlalchemy import text

from app.database import engine
from app.services.rag.chunking import TextChunker
from app.services.rag.vector_store import InMemoryVectorStore, get_vector_store
from app.services.rag.embeddings import get_embedding_engine

logger = logging.getLogger("decisionlens.rag.document")


class DocumentRAGService:
    """
    Manages private, user-uploaded document RAG (BYOC: Bring Your Own Context).
    Dual-engine:
    1. Persistent pgvector storage in Supabase PostgreSQL (decision_document_chunks table)
    2. Sub-millisecond in-memory cache for fast interactive retrieval
    3. Automatic database rehydration on cold start
    """

    def __init__(self, vector_store: Optional[InMemoryVectorStore] = None):
        self.vector_store = vector_store or get_vector_store()
        self.chunker = TextChunker(chunk_size=450, chunk_overlap=90)
        self.embedding_engine = get_embedding_engine()

    def _get_collection_name(self, decision_id: int) -> str:
        return f"decision_{decision_id}_attachments"

    def _is_pg_available(self) -> bool:
        """Check if connected to PostgreSQL/Supabase engine."""
        try:
            return engine.dialect.name == "postgresql"
        except Exception:
            return False

    def index_attachments(self, decision_id: int, attachments: List[Any]) -> int:
        """
        Chunk, embed, and index all attachments belonging to a decision.
        Persists into Supabase pgvector table and synchronizes in-memory vector store.
        """
        collection_name = self._get_collection_name(decision_id)
        self.vector_store.delete_collection(collection_name)

        all_chunks = []
        for att in attachments:
            text_content = getattr(att, "extracted_text", "") or ""
            if not text_content.strip():
                continue

            doc_name = getattr(att, "original_name", "document")
            att_id = getattr(att, "id", 0)

            chunks = self.chunker.split_text(
                text=text_content,
                document_id=f"att_{att_id}",
                base_metadata={
                    "decision_id": decision_id,
                    "attachment_id": att_id,
                    "document_name": doc_name,
                },
            )
            all_chunks.extend(chunks)

        # 1. Update In-Memory Vector Store
        count = self.vector_store.add_chunks(collection_name, all_chunks)

        # 2. Persist into Supabase pgvector if PostgreSQL is active
        if self._is_pg_available() and all_chunks:
            try:
                with engine.connect() as conn:
                    # Clean old chunks for this decision
                    conn.execute(
                        text("DELETE FROM decision_document_chunks WHERE decision_id = :dec_id"),
                        {"dec_id": decision_id},
                    )
                    # Insert new chunks with vector embeddings
                    for c in all_chunks:
                        vec = self.embedding_engine.encode(c.content)
                        vec_str = "[" + ",".join(str(x) for x in vec) + "]"
                        conn.execute(
                            text("""
                                INSERT INTO decision_document_chunks 
                                (id, decision_id, attachment_id, document_name, chunk_index, content, metadata_json, embedding)
                                VALUES 
                                (:id, :dec_id, :att_id, :doc_name, :chunk_idx, :content, CAST(:meta AS jsonb), CAST(:embedding AS vector))
                                ON CONFLICT (id) DO UPDATE SET 
                                    content = EXCLUDED.content, 
                                    embedding = EXCLUDED.embedding,
                                    metadata_json = EXCLUDED.metadata_json;
                            """),
                            {
                                "id": c.id,
                                "dec_id": decision_id,
                                "att_id": c.metadata.get("attachment_id"),
                                "doc_name": c.metadata.get("document_name"),
                                "chunk_idx": c.chunk_index,
                                "content": c.content,
                                "meta": json.dumps(c.metadata),
                                "embedding": vec_str,
                            },
                        )
                    conn.commit()
                    logger.info(f"Persisted {len(all_chunks)} chunks into Supabase pgvector for decision {decision_id}")
            except Exception as e:
                logger.warning(f"Failed to persist chunks to pgvector (falling back to memory): {e}")

        logger.info(
            f"Indexed {count} chunks for decision {decision_id} private attachments"
        )
        return count

    def retrieve_relevant_excerpts(
        self,
        decision_id: int,
        query: str,
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve top_k most relevant excerpts.
        Tries Supabase pgvector native cosine similarity search first;
        falls back to in-memory vector cache if offline.
        """
        # If pgvector is available, perform native SQL cosine distance search
        if self._is_pg_available():
            try:
                query_vec = self.embedding_engine.encode(query)
                query_vec_str = "[" + ",".join(str(x) for x in query_vec) + "]"
                with engine.connect() as conn:
                    rows = conn.execute(
                        text("""
                            SELECT id, content, document_name, metadata_json, 1 - (embedding <=> CAST(:qvec AS vector)) AS score
                            FROM decision_document_chunks
                            WHERE decision_id = :dec_id
                            ORDER BY embedding <=> CAST(:qvec AS vector)
                            LIMIT :top_k;
                        """),
                        {"dec_id": decision_id, "qvec": query_vec_str, "top_k": top_k},
                    ).fetchall()
                    if rows:
                        results = []
                        for r in rows:
                            meta = r[3] if isinstance(r[3], dict) else {}
                            if "document_name" not in meta and r[2]:
                                meta["document_name"] = r[2]
                            results.append({
                                "id": r[0],
                                "content": r[1],
                                "score": round(float(r[4]), 4),
                                "metadata": meta,
                            })
                        return results
            except Exception as e:
                logger.warning(f"pgvector query failed (falling back to memory cache): {e}")

        # Fallback to in-memory vector cache
        collection_name = self._get_collection_name(decision_id)
        if self.vector_store.collection_size(collection_name) == 0:
            # Attempt rehydration from DB
            self._rehydrate_from_db(decision_id)

        if self.vector_store.collection_size(collection_name) == 0:
            return []

        return self.vector_store.similarity_search(collection_name, query, top_k=top_k)

    def _rehydrate_from_db(self, decision_id: int) -> int:
        """Cold-start recovery: Loads chunks from PostgreSQL into in-memory vector store."""
        if not self._is_pg_available():
            return 0
        try:
            collection_name = self._get_collection_name(decision_id)
            with engine.connect() as conn:
                rows = conn.execute(
                    text("SELECT id, content, metadata_json FROM decision_document_chunks WHERE decision_id = :dec_id"),
                    {"dec_id": decision_id},
                ).fetchall()
                if not rows:
                    return 0
                texts = [r[1] for r in rows]
                metas = [r[2] if isinstance(r[2], dict) else {} for r in rows]
                ids = [r[0] for r in rows]
                count = self.vector_store.add_texts(collection_name, texts=texts, metadatas=metas, ids=ids)
                logger.info(f"Rehydrated {count} chunks from pgvector for decision {decision_id}")
                return count
        except Exception as e:
            logger.warning(f"Failed to rehydrate from pgvector: {e}")
            return 0

    def has_indexed_documents(self, decision_id: int) -> bool:
        collection_name = self._get_collection_name(decision_id)
        if self.vector_store.collection_size(collection_name) > 0:
            return True
        if self._is_pg_available():
            try:
                with engine.connect() as conn:
                    res = conn.execute(
                        text("SELECT 1 FROM decision_document_chunks WHERE decision_id = :dec_id LIMIT 1"),
                        {"dec_id": decision_id},
                    ).fetchone()
                    return res is not None
            except Exception:
                pass
        return False

    def get_chunk_count(self, decision_id: int) -> int:
        collection_name = self._get_collection_name(decision_id)
        mem_count = self.vector_store.collection_size(collection_name)
        if mem_count > 0:
            return mem_count
        if self._is_pg_available():
            try:
                with engine.connect() as conn:
                    res = conn.execute(
                        text("SELECT COUNT(1) FROM decision_document_chunks WHERE decision_id = :dec_id"),
                        {"dec_id": decision_id},
                    ).scalar()
                    return int(res or 0)
            except Exception:
                pass
        return 0

    def delete_decision_index(self, decision_id: int) -> bool:
        collection_name = self._get_collection_name(decision_id)
        self.vector_store.delete_collection(collection_name)
        if self._is_pg_available():
            try:
                with engine.connect() as conn:
                    conn.execute(
                        text("DELETE FROM decision_document_chunks WHERE decision_id = :dec_id"),
                        {"dec_id": decision_id},
                    )
                    conn.commit()
            except Exception as e:
                logger.warning(f"Failed to delete chunks from pgvector: {e}")
        return True


_default_document_rag_service: Optional[DocumentRAGService] = None


def get_document_rag_service() -> DocumentRAGService:
    global _default_document_rag_service
    if _default_document_rag_service is None:
        _default_document_rag_service = DocumentRAGService()
    return _default_document_rag_service
