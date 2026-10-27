from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import logging

from app.services.rag.chunking import TextChunker
from app.services.rag.vector_store import InMemoryVectorStore, get_vector_store
from app.services.rag.router import DomainType, classify_decision_domain

logger = logging.getLogger("decisionlens.rag.domain")


class DomainRAGService:
    """
    Manages curated domain knowledge bases for Career, Legal, and Software standards.
    Automatically indexes domain guidelines into dedicated vector collections.
    """

    def __init__(self, vector_store: Optional[InMemoryVectorStore] = None):
        self.vector_store = vector_store or get_vector_store()
        self.chunker = TextChunker(chunk_size=400, chunk_overlap=80)
        self._initialized = False

    def initialize_knowledge_bases(self, force: bool = False) -> None:
        """Loads and indexes the domain markdown knowledge bases if not already loaded."""
        if self._initialized and not force:
            return

        base_dir = Path(__file__).resolve().parent.parent.parent / "data" / "domain_knowledge"
        domain_files = {
            DomainType.CAREER: base_dir / "career.md",
            DomainType.LEGAL: base_dir / "legal.md",
            DomainType.SOFTWARE: base_dir / "software.md",
        }

        for domain, file_path in domain_files.items():
            collection_name = f"domain_{domain.value}"
            if file_path.exists():
                try:
                    content = file_path.read_text(encoding="utf-8")
                    chunks = self.chunker.split_text(
                        content,
                        document_id=f"std_{domain.value}",
                        base_metadata={"domain": domain.value, "source_file": file_path.name},
                    )
                    self.vector_store.delete_collection(collection_name)
                    self.vector_store.add_chunks(collection_name, chunks)
                    logger.info(
                        f"Indexed {len(chunks)} chunks into domain vector collection: {collection_name}"
                    )
                except Exception as e:
                    logger.error(f"Failed to index domain knowledge for {domain.value}: {e}")

        self._initialized = True

    def retrieve_domain_blind_spots(
        self,
        domain: DomainType,
        query: str,
        top_k: int = 2,
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant domain standards and checklists for a query."""
        if not self._initialized:
            self.initialize_knowledge_bases()

        if domain == DomainType.GENERAL:
            return []

        collection_name = f"domain_{domain.value}"
        return self.vector_store.similarity_search(collection_name, query, top_k=top_k)

    def retrieve_blind_spots_for_decision(
        self,
        decision_text: str,
        top_k: int = 2,
    ) -> Tuple[DomainType, List[Dict[str, Any]]]:
        """Classify decision domain and retrieve matching domain blind-spot standards."""
        domain, conf = classify_decision_domain(decision_text)
        if domain == DomainType.GENERAL:
            return domain, []

        results = self.retrieve_domain_blind_spots(domain, decision_text, top_k=top_k)
        return domain, results


_default_domain_rag_service: Optional[DomainRAGService] = None


def get_domain_rag_service() -> DomainRAGService:
    global _default_domain_rag_service
    if _default_domain_rag_service is None:
        _default_domain_rag_service = DomainRAGService()
        _default_domain_rag_service.initialize_knowledge_bases()
    return _default_domain_rag_service
