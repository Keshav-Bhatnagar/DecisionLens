import math
from typing import Any, Dict, List, Optional
import logging

from app.services.rag.chunking import TextChunk
from app.services.rag.embeddings import EmbeddingEngine, get_embedding_engine

logger = logging.getLogger("decisionlens.rag.vector_store")


class VectorDocument:
    def __init__(
        self,
        id: str,
        content: str,
        vector: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.id = id
        self.content = content
        self.vector = vector
        self.metadata = metadata or {}


class InMemoryVectorStore:
    """
    Lightweight, high-performance in-memory vector database
    with collection partitioning and exact Cosine Similarity retrieval.
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
    ) -> int:
        """Add TextChunk instances to the specified collection."""
        self.ensure_collection(collection_name)
        count = 0
        for chunk in chunks:
            vector = self.embedding_engine.encode(chunk.content)
            doc = VectorDocument(
                id=chunk.id,
                content=chunk.content,
                vector=vector,
                metadata=chunk.metadata,
            )
            self._collections[collection_name][chunk.id] = doc
            count += 1
        return count

    def add_texts(
        self,
        collection_name: str,
        texts: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
        ids: Optional[List[str]] = None,
    ) -> int:
        """Directly add raw texts to a collection."""
        self.ensure_collection(collection_name)
        metas = metadatas or [{} for _ in texts]
        doc_ids = ids or [f"{collection_name}_{idx}" for idx in range(len(texts))]

        count = 0
        for i, text in enumerate(texts):
            vector = self.embedding_engine.encode(text)
            doc = VectorDocument(
                id=doc_ids[i],
                content=text,
                vector=vector,
                metadata=metas[i],
            )
            self._collections[collection_name][doc_ids[i]] = doc
            count += 1
        return count

    def similarity_search(
        self,
        collection_name: str,
        query: str,
        top_k: int = 3,
        min_score: float = 0.0,
    ) -> List[Dict[str, Any]]:
        """
        Compute Cosine Similarity against all documents in the collection
        and return the top_k results.
        """
        if collection_name not in self._collections:
            return []

        collection = self._collections[collection_name]
        if not collection:
            return []

        query_vector = self.embedding_engine.encode(query)

        scored_results = []
        for doc in collection.values():
            # Dot product of unit-normalized vectors = Cosine Similarity
            score = sum(q * d for q, d in zip(query_vector, doc.vector))
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
