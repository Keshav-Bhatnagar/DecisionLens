import logging
import re
from typing import Any, Dict, List, Optional

from app.services.rag.chunking import TextChunk
from app.services.rag.embeddings import EmbeddingEngine, cosine, get_embedding_engine

logger = logging.getLogger("decisionlens.rag.vector_store")

# Weight of exact keyword overlap blended into the semantic score (hybrid retrieval).
# Keeps precise terms like clause numbers, product names and figures from being missed.
LEXICAL_WEIGHT = 0.15

_STOPWORDS = {
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one",
    "our", "out", "has", "have", "how", "its", "may", "who", "did", "get", "use", "with", "this", "that",
    "from", "they", "will", "what", "when", "where", "which", "while", "about", "would", "there", "their",
    "should", "could", "does", "into", "than", "then", "them", "these", "those", "were", "been", "being",
    "also", "just", "only", "over", "such", "some", "more", "most", "very", "much", "many", "your",
}


def _keywords(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9][a-z0-9\-\.$%]*[a-z0-9%]|[a-z0-9]{3,}", (text or "").lower())
    return [t for t in tokens if len(t) >= 3 and t not in _STOPWORDS]


def lexical_overlap(query: str, content: str) -> float:
    """Fraction of distinct query keywords that appear in the content (0..1)."""
    q = set(_keywords(query))
    if not q:
        return 0.0
    c = set(_keywords(content))
    return len(q & c) / len(q)


def hybrid_score(semantic: float, query: str, content: str) -> float:
    return (1 - LEXICAL_WEIGHT) * semantic + LEXICAL_WEIGHT * lexical_overlap(query, content)


class VectorDocument:
    def __init__(
        self,
        id: str,
        content: str,
        vector: List[float],
        metadata: Optional[Dict[str, Any]] = None,
        model_id: Optional[str] = None,
    ):
        self.id = id
        self.content = content
        self.vector = vector
        self.metadata = metadata or {}
        self.model_id = model_id
        self._local_vector: Optional[List[float]] = None


class InMemoryVectorStore:
    """
    Lightweight in-memory vector index with collection partitioning,
    exact cosine similarity and a small keyword boost (hybrid retrieval).

    Each document remembers which embedding model produced its vector. A query
    is only compared against vectors from the same model; if a collection mixes
    models (for example the hosted model was briefly down during indexing), the
    whole collection is scored with the local model so rankings stay consistent.
    """

    def __init__(self, embedding_engine: Optional[EmbeddingEngine] = None):
        self.embedding_engine = embedding_engine or get_embedding_engine()
        self._collections: Dict[str, Dict[str, VectorDocument]] = {}

    def ensure_collection(self, collection_name: str) -> None:
        if collection_name not in self._collections:
            self._collections[collection_name] = {}

    def add_chunks(
        self,
        collection_name: str,
        chunks: List[TextChunk],
        vectors: Optional[List[List[float]]] = None,
        model_id: Optional[str] = None,
    ) -> int:
        """Add TextChunk instances. Pass precomputed vectors to avoid re-embedding."""
        self.ensure_collection(collection_name)
        if not chunks:
            return 0
        if vectors is None or len(vectors) != len(chunks):
            vectors, model_id = self.embedding_engine.encode_batch_with_model([c.content for c in chunks])
        for chunk, vector in zip(chunks, vectors):
            self._collections[collection_name][chunk.id] = VectorDocument(
                id=chunk.id,
                content=chunk.content,
                vector=vector,
                metadata=chunk.metadata,
                model_id=model_id,
            )
        return len(chunks)

    def add_texts(
        self,
        collection_name: str,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ) -> int:
        """Directly add raw texts to a collection."""
        self.ensure_collection(collection_name)
        if not texts:
            return 0
        metas = metadatas or [{} for _ in texts]
        doc_ids = ids or [f"{collection_name}_{idx}" for idx in range(len(texts))]
        vectors, model_id = self.embedding_engine.encode_batch_with_model(texts)

        for i, text in enumerate(texts):
            self._collections[collection_name][doc_ids[i]] = VectorDocument(
                id=doc_ids[i],
                content=text,
                vector=vectors[i],
                metadata=metas[i],
                model_id=model_id,
            )
        return len(texts)

    def _local_vector(self, doc: VectorDocument) -> List[float]:
        if doc.model_id == self.embedding_engine.local_model_id:
            return doc.vector
        if doc._local_vector is None:
            doc._local_vector = self.embedding_engine.local_encode(doc.content)
        return doc._local_vector

    def similarity_search(
        self,
        collection_name: str,
        query: str,
        top_k: int = 3,
        min_score: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """Score every document in the collection against the query and return the top_k."""
        collection = self._collections.get(collection_name)
        if not collection:
            return []

        docs = list(collection.values())
        model_ids = {d.model_id for d in docs}
        engine = self.embedding_engine

        query_vec: Optional[List[float]] = None
        use_local = True
        if len(model_ids) == 1:
            only_model = next(iter(model_ids))
            if only_model:
                encoded = engine.encode_for_model([query], only_model)
                if encoded:
                    query_vec = encoded[0]
                    use_local = only_model == engine.local_model_id

        if query_vec is None:
            query_vec = engine.local_encode(query)
            use_local = True

        scored_results = []
        for doc in docs:
            doc_vec = self._local_vector(doc) if use_local else doc.vector
            score = hybrid_score(cosine(query_vec, doc_vec), query, doc.content)
            if score >= min_score:
                scored_results.append(
                    {
                        "id": doc.id,
                        "content": doc.content,
                        "metadata": doc.metadata,
                        "score": round(score, 4),
                    }
                )

        scored_results.sort(key=lambda x: x["score"], reverse=True)
        return scored_results[:top_k]

    def collection_size(self, collection_name: str) -> int:
        return len(self._collections.get(collection_name, {}))

    def collection_model_ids(self, collection_name: str) -> List[str]:
        return sorted({d.model_id or "" for d in self._collections.get(collection_name, {}).values()})

    def list_collections(self) -> List[str]:
        return list(self._collections.keys())

    def delete_collection(self, collection_name: str) -> bool:
        if collection_name in self._collections:
            del self._collections[collection_name]
            return True
        return False

    def clear(self) -> None:
        self._collections.clear()


_default_vector_store: Optional[InMemoryVectorStore] = None


def get_vector_store() -> InMemoryVectorStore:
    global _default_vector_store
    if _default_vector_store is None:
        _default_vector_store = InMemoryVectorStore()
    return _default_vector_store
