import json
import logging
import time
from typing import Any, Dict, List, Optional

from sqlalchemy import text

import app.database as app_db
from app.services.rag.chunking import TextChunk, TextChunker
from app.services.rag.embeddings import get_embedding_engine
from app.services.rag.vector_store import InMemoryVectorStore, get_vector_store, hybrid_score

logger = logging.getLogger("decisionlens.rag.document")

PG_WRITE_BATCH = 100
VECTOR_SCHEMA_RECHECK_SECONDS = 300.0


def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


class DocumentRAGService:
    """
    Manages private, user-uploaded document RAG (BYOC: Bring Your Own Context).

    Storage:
    1. Persistent pgvector storage in Supabase PostgreSQL (decision_document_chunks table),
       each row tagged with the embedding model that produced it.
    2. In-memory index used on SQLite or whenever pgvector is unavailable.

    Self-healing: when the embedding model changes (for example after adding an
    Azure embedding deployment), chunks embedded with the old model are re-embedded
    the next time that decision is searched, or all at once via the re-index endpoint.
    """

    def __init__(self, vector_store: Optional[InMemoryVectorStore] = None):
        self.vector_store = vector_store or get_vector_store()
        self.chunker = TextChunker(chunk_size=450, chunk_overlap=90)
        self.embedding_engine = get_embedding_engine()
        self._vector_schema_ok: Optional[bool] = None
        self._vector_schema_checked_at = 0.0

    # ------------------------------------------------------------------
    # Backend detection
    # ------------------------------------------------------------------
    def _get_collection_name(self, decision_id: int) -> str:
        return f"decision_{decision_id}_attachments"

    def _is_pg_available(self) -> bool:
        """Check if connected to PostgreSQL/Supabase engine."""
        try:
            return app_db.engine.dialect.name == "postgresql"
        except Exception:
            return False

    def _pg_vector_ready(self) -> bool:
        """True when the chunks table has an `embedding vector(N)` column matching our dimension."""
        if not self._is_pg_available():
            return False
        now = time.monotonic()
        if self._vector_schema_ok is not None and (
            self._vector_schema_ok or now - self._vector_schema_checked_at < VECTOR_SCHEMA_RECHECK_SECONDS
        ):
            return self._vector_schema_ok
        ok = False
        try:
            with app_db.engine.connect() as conn:
                col_type = conn.execute(
                    text(
                        "SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a "
                        "WHERE a.attrelid = 'decision_document_chunks'::regclass "
                        "AND a.attname = 'embedding' AND NOT a.attisdropped"
                    )
                ).scalar()
                ok = col_type == f"vector({self.embedding_engine.dimension})"
                if not ok:
                    logger.warning(
                        "pgvector column not ready (found %s, expected vector(%s)); using in-memory search.",
                        col_type,
                        self.embedding_engine.dimension,
                    )
        except Exception as exc:
            logger.warning("Could not verify pgvector schema: %s", exc)
        self._vector_schema_ok = ok
        self._vector_schema_checked_at = now
        return ok

    def storage_engine(self) -> str:
        return "supabase_pgvector" if self._pg_vector_ready() else "in_memory_vector_store"

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------
    def _chunk_attachments(self, decision_id: int, attachments: List[Any]) -> List[TextChunk]:
        all_chunks: List[TextChunk] = []
        for att in attachments:
            text_content = getattr(att, "extracted_text", "") or ""
            if not text_content.strip():
                continue
            doc_name = getattr(att, "original_name", "document")
            att_id = getattr(att, "id", 0)
            all_chunks.extend(
                self.chunker.split_text(
                    text=text_content,
                    document_id=f"att_{att_id}",
                    base_metadata={
                        "decision_id": decision_id,
                        "attachment_id": att_id,
                        "document_name": doc_name,
                    },
                )
            )
        return all_chunks

    def index_attachments(self, decision_id: int, attachments: List[Any]) -> int:
        """
        Chunk, embed (one batched call), and index all attachments belonging to a decision.
        Replaces any previous index for the decision, so deleting a file also removes its chunks.
        """
        collection_name = self._get_collection_name(decision_id)
        self.vector_store.delete_collection(collection_name)

        all_chunks = self._chunk_attachments(decision_id, attachments)
        vectors: List[List[float]] = []
        model_id = self.embedding_engine.preferred_model_id()
        if all_chunks:
            vectors, model_id = self.embedding_engine.encode_batch_with_model([c.content for c in all_chunks])

        count = self.vector_store.add_chunks(collection_name, all_chunks, vectors=vectors, model_id=model_id)

        if self._is_pg_available():
            self._persist_chunks_pg(decision_id, all_chunks, vectors, model_id)

        logger.info(
            "Indexed %s chunks for decision %s with %s", count, decision_id, model_id
        )
        return count

    def _persist_chunks_pg(
        self,
        decision_id: int,
        chunks: List[TextChunk],
        vectors: List[List[float]],
        model_id: str,
    ) -> None:
        with_vectors = self._pg_vector_ready()
        try:
            with app_db.engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM decision_document_chunks WHERE decision_id = :dec_id"),
                    {"dec_id": decision_id},
                )
                if not chunks:
                    return
                rows = []
                for c, vec in zip(chunks, vectors):
                    row = {
                        "id": c.id if len(c.id) <= 200 else c.id[:200],
                        "dec_id": decision_id,
                        "att_id": c.metadata.get("attachment_id"),
                        "doc_name": (c.metadata.get("document_name") or "")[:255],
                        "chunk_idx": c.chunk_index,
                        "content": c.content,
                        "meta": json.dumps(c.metadata),
                        "model": model_id,
                    }
                    if with_vectors:
                        row["embedding"] = _vec_literal(vec)
                    rows.append(row)

                if with_vectors:
                    stmt = text(
                        """
                        INSERT INTO decision_document_chunks
                            (id, decision_id, attachment_id, document_name, chunk_index, content,
                             metadata_json, embedding_model, embedding, created_at)
                        VALUES
                            (:id, :dec_id, :att_id, :doc_name, :chunk_idx, :content,
                             CAST(:meta AS jsonb), :model, CAST(:embedding AS vector), NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            content = EXCLUDED.content,
                            embedding = EXCLUDED.embedding,
                            embedding_model = EXCLUDED.embedding_model,
                            metadata_json = EXCLUDED.metadata_json
                        """
                    )
                else:
                    stmt = text(
                        """
                        INSERT INTO decision_document_chunks
                            (id, decision_id, attachment_id, document_name, chunk_index, content,
                             metadata_json, embedding_model, created_at)
                        VALUES
                            (:id, :dec_id, :att_id, :doc_name, :chunk_idx, :content,
                             CAST(:meta AS jsonb), :model, NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            content = EXCLUDED.content,
                            embedding_model = EXCLUDED.embedding_model,
                            metadata_json = EXCLUDED.metadata_json
                        """
                    )
                for start in range(0, len(rows), PG_WRITE_BATCH):
                    conn.execute(stmt, rows[start : start + PG_WRITE_BATCH])
            logger.info("Persisted %s chunks to Postgres for decision %s", len(chunks), decision_id)
        except Exception as e:
            logger.warning(f"Failed to persist chunks to Postgres (in-memory index still active): {e}")

    def reindex_decision(self, decision_id: int, db=None) -> int:
        """Rebuild the index for one decision from its stored attachments."""
        from app.models import Attachment

        session = db or app_db.SessionLocal()
        try:
            atts = session.query(Attachment).filter(Attachment.decision_id == decision_id).all()
            return self.index_attachments(decision_id, atts)
        finally:
            if db is None:
                session.close()

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------
    def _heal_stale_pg(self, decision_id: int, model_id: str) -> bool:
        """Re-embed any chunks for this decision that were embedded with another model."""
        try:
            with app_db.engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT id, content FROM decision_document_chunks "
                        "WHERE decision_id = :dec_id AND (embedding IS NULL OR embedding_model IS DISTINCT FROM :model)"
                    ),
                    {"dec_id": decision_id, "model": model_id},
                ).fetchall()
            if not rows:
                return True
            vectors = self.embedding_engine.encode_for_model([r[1] for r in rows], model_id)
            if vectors is None:
                return False
            params = [
                {"id": r[0], "embedding": _vec_literal(v), "model": model_id}
                for r, v in zip(rows, vectors)
            ]
            with app_db.engine.begin() as conn:
                stmt = text(
                    "UPDATE decision_document_chunks SET embedding = CAST(:embedding AS vector), "
                    "embedding_model = :model WHERE id = :id"
                )
                for start in range(0, len(params), PG_WRITE_BATCH):
                    conn.execute(stmt, params[start : start + PG_WRITE_BATCH])
            logger.info("Re-embedded %s stale chunks for decision %s with %s", len(rows), decision_id, model_id)
            return True
        except Exception as exc:
            logger.warning("Could not refresh stale chunk embeddings: %s", exc)
            return False

    def _search_pg(self, decision_id: int, query: str, top_k: int) -> Optional[List[Dict[str, Any]]]:
        model_id = self.embedding_engine.preferred_model_id()
        if not self._heal_stale_pg(decision_id, model_id):
            return None
        query_vecs = self.embedding_engine.encode_for_model([query], model_id)
        if not query_vecs:
            return None
        candidates = max(top_k * 4, 12)
        with app_db.engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT id, content, document_name, metadata_json,
                           1 - (embedding <=> CAST(:qvec AS vector)) AS score
                    FROM decision_document_chunks
                    WHERE decision_id = :dec_id AND embedding_model = :model AND embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:qvec AS vector)
                    LIMIT :lim
                    """
                ),
                {"dec_id": decision_id, "qvec": _vec_literal(query_vecs[0]), "model": model_id, "lim": candidates},
            ).fetchall()
        results = []
        for r in rows:
            meta = r[3] if isinstance(r[3], dict) else {}
            if isinstance(r[3], str):
                try:
                    meta = json.loads(r[3])
                except Exception:
                    meta = {}
            if "document_name" not in meta and r[2]:
                meta["document_name"] = r[2]
            results.append(
                {
                    "id": r[0],
                    "content": r[1],
                    "score": round(hybrid_score(float(r[4]), query, r[1]), 4),
                    "metadata": meta,
                }
            )
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def retrieve_relevant_excerpts(
        self,
        decision_id: int,
        query: str,
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve the top_k most relevant excerpts.
        Uses pgvector cosine search when available; otherwise the in-memory index,
        rebuilding it from the database after a restart.
        """
        if not (query or "").strip():
            return []

        if self._pg_vector_ready():
            try:
                results = self._search_pg(decision_id, query, top_k)
                if results is not None and (results or not self._has_pg_rows(decision_id)):
                    return results
            except Exception as e:
                logger.warning(f"pgvector query failed (falling back to in-memory index): {e}")

        collection_name = self._get_collection_name(decision_id)
        if self.vector_store.collection_size(collection_name) == 0:
            self._rehydrate(decision_id)
        if self.vector_store.collection_size(collection_name) == 0:
            return []
        return self.vector_store.similarity_search(collection_name, query, top_k=top_k)

    def _has_pg_rows(self, decision_id: int) -> bool:
        try:
            with app_db.engine.connect() as conn:
                return (
                    conn.execute(
                        text("SELECT 1 FROM decision_document_chunks WHERE decision_id = :dec_id LIMIT 1"),
                        {"dec_id": decision_id},
                    ).fetchone()
                    is not None
                )
        except Exception:
            return False

    def _rehydrate(self, decision_id: int) -> int:
        """Cold-start recovery: rebuild the in-memory index from stored chunks or attachments."""
        collection_name = self._get_collection_name(decision_id)
        if self._is_pg_available():
            try:
                with app_db.engine.connect() as conn:
                    rows = conn.execute(
                        text(
                            "SELECT id, content, metadata_json FROM decision_document_chunks "
                            "WHERE decision_id = :dec_id ORDER BY attachment_id, chunk_index"
                        ),
                        {"dec_id": decision_id},
                    ).fetchall()
                if rows:
                    metas = []
                    for r in rows:
                        m = r[2]
                        if isinstance(m, str):
                            try:
                                m = json.loads(m)
                            except Exception:
                                m = {}
                        metas.append(m if isinstance(m, dict) else {})
                    count = self.vector_store.add_texts(
                        collection_name, texts=[r[1] for r in rows], metadatas=metas, ids=[r[0] for r in rows]
                    )
                    logger.info(f"Rehydrated {count} chunks from Postgres for decision {decision_id}")
                    return count
            except Exception as e:
                logger.warning(f"Failed to rehydrate from Postgres: {e}")

        # SQLite / no stored chunks: rebuild directly from attachment text (memory only)
        try:
            from app.models import Attachment

            session = app_db.SessionLocal()
            try:
                atts = session.query(Attachment).filter(Attachment.decision_id == decision_id).all()
            finally:
                session.close()
            chunks = self._chunk_attachments(decision_id, atts)
            if chunks:
                return self.vector_store.add_chunks(collection_name, chunks)
        except Exception as e:
            logger.warning(f"Failed to rebuild index from attachments: {e}")
        return 0

    # Backwards-compatible name
    def _rehydrate_from_db(self, decision_id: int) -> int:
        return self._rehydrate(decision_id)

    # ------------------------------------------------------------------
    # Status & maintenance
    # ------------------------------------------------------------------
    def has_indexed_documents(self, decision_id: int) -> bool:
        if self.vector_store.collection_size(self._get_collection_name(decision_id)) > 0:
            return True
        if self._is_pg_available() and self._has_pg_rows(decision_id):
            return True
        return self._rehydrate(decision_id) > 0

    def get_chunk_count(self, decision_id: int) -> int:
        return int(self.get_index_status(decision_id)["chunk_count"])

    def get_index_status(self, decision_id: int) -> Dict[str, Any]:
        """Chunk and document counts plus which embedding model the index uses."""
        preferred = self.embedding_engine.preferred_model_id()
        status: Dict[str, Any] = {
            "chunk_count": 0,
            "document_count": 0,
            "embedding_model": preferred,
            "semantic": self.embedding_engine.is_semantic(preferred),
            "stale_chunks": 0,
            "storage_engine": self.storage_engine(),
        }

        if self._is_pg_available():
            try:
                with app_db.engine.connect() as conn:
                    row = conn.execute(
                        text(
                            "SELECT COUNT(1), COUNT(DISTINCT attachment_id), "
                            "SUM(CASE WHEN embedding_model IS DISTINCT FROM :model THEN 1 ELSE 0 END) "
                            "FROM decision_document_chunks WHERE decision_id = :dec_id"
                        ),
                        {"dec_id": decision_id, "model": preferred},
                    ).fetchone()
                if row and int(row[0] or 0) > 0:
                    status["chunk_count"] = int(row[0] or 0)
                    status["document_count"] = int(row[1] or 0)
                    status["stale_chunks"] = int(row[2] or 0)
                    return status
            except Exception as exc:
                logger.debug("Postgres status lookup failed: %s", exc)

        collection_name = self._get_collection_name(decision_id)
        if self.vector_store.collection_size(collection_name) == 0:
            self._rehydrate(decision_id)
        docs = self.vector_store._collections.get(collection_name, {})
        status["chunk_count"] = len(docs)
        status["document_count"] = len({d.metadata.get("attachment_id") for d in docs.values()})
        status["stale_chunks"] = sum(1 for d in docs.values() if d.model_id != preferred)
        return status

    def delete_decision_index(self, decision_id: int) -> bool:
        collection_name = self._get_collection_name(decision_id)
        self.vector_store.delete_collection(collection_name)
        if self._is_pg_available():
            try:
                with app_db.engine.begin() as conn:
                    conn.execute(
                        text("DELETE FROM decision_document_chunks WHERE decision_id = :dec_id"),
                        {"dec_id": decision_id},
                    )
            except Exception as e:
                logger.warning(f"Failed to delete chunks from Postgres: {e}")
        return True


_default_document_rag_service: Optional[DocumentRAGService] = None


def get_document_rag_service() -> DocumentRAGService:
    global _default_document_rag_service
    if _default_document_rag_service is None:
        _default_document_rag_service = DocumentRAGService()
    return _default_document_rag_service
