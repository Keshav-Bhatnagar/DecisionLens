from typing import Any, Dict, List, Optional
import logging

from app.services.rag.chunking import TextChunker
from app.services.rag.vector_store import InMemoryVectorStore, get_vector_store

logger = logging.getLogger("decisionlens.rag.document")


class DocumentRAGService:
    """
    Manages private, user-uploaded document RAG (BYOC: Bring Your Own Context).
    Indexes attached PDFs, DOCX, and notes per decision session to retrieve
    focused, relevant excerpts without context window bloat.
    """

    def __init__(self, vector_store: Optional[InMemoryVectorStore] = None):
        self.vector_store = vector_store or get_vector_store()
        self.chunker = TextChunker(chunk_size=450, chunk_overlap=90)

    def _get_collection_name(self, decision_id: int) -> str:
        return f"decision_{decision_id}_attachments"

    def index_attachments(self, decision_id: int, attachments: List[Any]) -> int:
        """
        Chunk and index all attachments belonging to a decision.
        Returns the total number of chunks indexed.
        """
        collection_name = self._get_collection_name(decision_id)
        self.vector_store.delete_collection(collection_name)

        total_chunks = 0
        for att in attachments:
            text = getattr(att, "extracted_text", "") or ""
            if not text.strip():
                continue

            doc_name = getattr(att, "original_name", "document")
            att_id = getattr(att, "id", 0)

            chunks = self.chunker.split_text(
                text=text,
                document_id=f"att_{att_id}",
                base_metadata={
                    "decision_id": decision_id,
                    "attachment_id": att_id,
                    "document_name": doc_name,
                },
            )
            count = self.vector_store.add_chunks(collection_name, chunks)
            total_chunks += count

        logger.info(
            f"Indexed {total_chunks} chunks for decision {decision_id} private attachments"
        )
        return total_chunks

    def retrieve_relevant_excerpts(
        self,
        decision_id: int,
        query: str,
        top_k: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve the top_k most relevant excerpts from the decision's private attachments.
        """
        collection_name = self._get_collection_name(decision_id)
        if self.vector_store.collection_size(collection_name) == 0:
            return []

        return self.vector_store.similarity_search(collection_name, query, top_k=top_k)

    def has_indexed_documents(self, decision_id: int) -> bool:
        collection_name = self._get_collection_name(decision_id)
        return self.vector_store.collection_size(collection_name) > 0

    def delete_decision_index(self, decision_id: int) -> bool:
        collection_name = self._get_collection_name(decision_id)
        return self.vector_store.delete_collection(collection_name)


_default_document_rag_service: Optional[DocumentRAGService] = None


def get_document_rag_service() -> DocumentRAGService:
    global _default_document_rag_service
    if _default_document_rag_service is None:
        _default_document_rag_service = DocumentRAGService()
    return _default_document_rag_service
