import pytest
from app.services.rag.chunking import TextChunker
from app.services.rag.embeddings import EmbeddingEngine
from app.services.rag.vector_store import InMemoryVectorStore
from app.services.rag.router import DomainRouter, DomainType, classify_decision_domain
from app.services.rag.domain_rag import DomainRAGService
from app.services.rag.document_rag import DocumentRAGService


def test_text_chunker():
    chunker = TextChunker(chunk_size=100, chunk_overlap=20, min_chunk_size=30)
    text = (
        "This is paragraph one with enough characters to be meaningful.\n\n"
        "This is paragraph two. It contains detailed sentences that should be preserved properly. "
        "Here is another sentence in paragraph two to increase the overall character count.\n\n"
        "This is paragraph three describing technical considerations."
    )
    chunks = chunker.split_text(text, document_id="doc_1")
    assert len(chunks) >= 2
    for c in chunks:
        assert len(c.content) >= 30
        assert c.id.startswith("doc_1_chunk_")
        assert "document_id" in c.metadata or c.metadata is not None


def test_embedding_engine_cosine_similarity():
    engine = EmbeddingEngine(dimension=384)
    v1 = engine.encode("PostgreSQL relational database consistency")
    v2 = engine.encode("Relational PostgreSQL database with ACID transactions")
    v3 = engine.encode("Career promotion salary negotiation and resume advice")

    # Cosine similarity is dot product of normalized vectors
    dot_similar = sum(a * b for a, b in zip(v1, v2))
    dot_dissimilar = sum(a * b for a, b in zip(v1, v3))

    assert dot_similar > dot_dissimilar
    assert dot_similar > 0.40  # Meaningful lexical & phrase overlap


def test_in_memory_vector_store():
    store = InMemoryVectorStore()
    collection = "test_collection"

    texts = [
        "AWS Lambda serverless architecture with API Gateway",
        "Kubernetes container orchestration with Helm charts",
        "Salary compensation and equity vesting cliff schedule",
    ]
    metadatas = [
        {"topic": "serverless"},
        {"topic": "k8s"},
        {"topic": "career"},
    ]
    store.add_texts(collection, texts=texts, metadatas=metadatas)

    results = store.similarity_search(collection, "serverless lambda functions", top_k=2)
    assert len(results) == 2
    assert results[0]["metadata"]["topic"] == "serverless"

    # Test collection management
    assert store.collection_size(collection) == 3
    store.delete_collection(collection)
    assert store.collection_size(collection) == 0


def test_domain_router():
    router = DomainRouter()

    domain, conf = router.classify("We need to decide whether to migrate our monolith to microservices on Kubernetes.")
    assert domain == DomainType.SOFTWARE
    assert conf > 0.5

    domain, conf = router.classify("Reviewing our SaaS ARR growth, customer acquisition cost payback, and runway.")
    assert domain == DomainType.BUSINESS
    assert conf > 0.5

    domain, conf = router.classify("Reviewing indemnity clauses, non-compete agreements, and intellectual property terms.")
    assert domain == DomainType.LEGAL
    assert conf > 0.5


def test_domain_rag_service():
    service = DomainRAGService()
    service.initialize_knowledge_bases()

    # Query business domain
    results = service.retrieve_domain_blind_spots(
        DomainType.BUSINESS, "CAC payback period and LTV to CAC ratio benchmarks", top_k=2
    )
    assert len(results) > 0
    assert any("CAC" in r["content"] or "LTV" in r["content"] or "Gross Margin" in r["content"] for r in results)

    # Query legal domain
    results = service.retrieve_domain_blind_spots(
        DomainType.LEGAL, "California non-compete enforceability and liability caps", top_k=2
    )
    assert len(results) > 0
    assert any("Non-Compete" in r["content"] or "Liability" in r["content"] for r in results)

    # Query software domain
    results = service.retrieve_domain_blind_spots(
        DomainType.SOFTWARE, "Serverless cold start latency and database connection pooling", top_k=2
    )
    assert len(results) > 0
    assert any("Serverless" in r["content"] or "Latency" in r["content"] or "Relational" in r["content"] for r in results)


def test_business_domain_rag_and_retrieve_guidelines():
    service = DomainRAGService()
    service.initialize_knowledge_bases()

    # Query business domain directly
    results = service.retrieve_domain_blind_spots(
        DomainType.BUSINESS, "Customer acquisition cost CAC payback and LTV ratio", top_k=2
    )
    assert len(results) > 0
    assert any("CAC" in r["content"] or "Unit Economics" in r["content"] or "LTV" in r["content"] for r in results)

    # Test the primary synthesis interface retrieve_guidelines
    guidelines = service.retrieve_guidelines(
        "B2B SaaS pricing models and burn multiple metrics", top_k=2
    )
    assert len(guidelines) > 0
    assert any("Pricing" in g["content"] or "Burn Multiple" in g["content"] or "SaaS" in g["content"] for g in guidelines)


def test_document_rag_service():
    class MockAttachment:
        def __init__(self, id, name, text):
            self.id = id
            self.original_name = name
            self.extracted_text = text

    att1 = MockAttachment(
        1,
        "contract.pdf",
        "Clause 14. Non-Compete. Employee agrees not to engage with any competing business for 24 months. "
        "Clause 15. Intellectual Property. All inventions are property of the company."
    )
    att2 = MockAttachment(
        2,
        "compensation.txt",
        "Base salary: $150,000 USD. Stock Options: 10,000 ISOs subject to 4-year vesting with a 1-year cliff."
    )

    doc_rag = DocumentRAGService()
    indexed_count = doc_rag.index_attachments(decision_id=999, attachments=[att1, att2])
    assert indexed_count >= 2
    assert doc_rag.has_indexed_documents(decision_id=999)
    assert doc_rag.get_chunk_count(decision_id=999) >= 2

    excerpts = doc_rag.retrieve_relevant_excerpts(
        decision_id=999, query="non-compete clause duration", top_k=1
    )
    assert len(excerpts) == 1
    assert "Non-Compete" in excerpts[0]["content"]

    # Clean up
    doc_rag.delete_decision_index(decision_id=999)
    assert not doc_rag.has_indexed_documents(decision_id=999)
