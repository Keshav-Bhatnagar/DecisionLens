import pytest
from app.services.rag.chunking import TextChunker
from app.services.rag.embeddings import EmbeddingEngine
from app.services.rag.vector_store import InMemoryVectorStore
from app.services.rag.router import DomainRouter, DomainType, classify_decision_domain
from app.services.rag.domain_rag import DomainRAGService, get_domain_rag_service
from app.services.rag.document_rag import DocumentRAGService


def test_text_chunker():
    chunker = TextChunker(chunk_size=150, chunk_overlap=30, min_chunk_size=40)
    sample_text = (
        "Paragraph one discusses database architecture and distributed systems reliability. "
        "It provides high throughput and low latency.\n\n"
        "Paragraph two discusses relational ACID compliance versus NoSQL eventual consistency. "
        "Choosing between PostgreSQL and DynamoDB requires careful evaluation."
    )
    chunks = chunker.split_text(sample_text, document_id="test_doc")
    assert len(chunks) >= 2
    assert chunks[0].id.startswith("test_doc_chunk_")
    assert "database" in chunks[0].content or "Paragraph" in chunks[0].content


def test_embedding_engine_cosine_similarity():
    engine = EmbeddingEngine(dimension=128)
    v1 = engine.encode("PostgreSQL relational database ACID transactions")
    v2 = engine.encode("Relational database with ACID consistency and SQL queries")
    v3 = engine.encode("Employment contract non-compete clause and salary equity")

    # Cosine similarity is dot product of normalized vectors
    dot_related = sum(a * b for a, b in zip(v1, v2))
    dot_unrelated = sum(a * b for a, b in zip(v1, v3))

    assert dot_related > dot_unrelated
    assert dot_related > 0.3


def test_in_memory_vector_store():
    store = InMemoryVectorStore()
    docs = [
        "AWS Lambda serverless compute cold-start latency is a critical factor.",
        "PostgreSQL database primary-replica replication and connection pooling.",
        "Commercial contract non-compete clauses are void under California law.",
    ]
    store.add_texts("tech_collection", docs)
    assert store.collection_size("tech_collection") == 3

    results = store.similarity_search("tech_collection", "serverless lambda cold start", top_k=1)
    assert len(results) == 1
    assert "Lambda" in results[0]["content"]
    assert results[0]["score"] > 0.0


def test_domain_router():
    router = DomainRouter()
    
    domain, conf = router.classify("Should I accept the new job offer with $160k salary and equity vesting?")
    assert domain == DomainType.CAREER
    assert conf > 0.0

    domain, conf = router.classify("Reviewing B2B SaaS contract liability caps and non-compete terms")
    assert domain == DomainType.LEGAL

    domain, conf = router.classify("Evaluating PostgreSQL vs DynamoDB for high-throughput microservices architecture")
    assert domain == DomainType.SOFTWARE

    domain, conf = router.classify("Planning what groceries to buy for dinner tonight")
    assert domain == DomainType.GENERAL


def test_domain_rag_service():
    service = get_domain_rag_service()
    service.initialize_knowledge_bases()

    # Query career domain
    results = service.retrieve_domain_blind_spots(
        DomainType.CAREER, "Evaluating safe runway and equity vesting options", top_k=2
    )
    assert len(results) > 0
    assert any("Runway" in r["content"] or "Equity" in r["content"] or "Compensation" in r["content"] for r in results)

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

    excerpts = doc_rag.retrieve_relevant_excerpts(
        decision_id=999, query="non-compete clause duration", top_k=1
    )
    assert len(excerpts) == 1
    assert "Non-Compete" in excerpts[0]["content"]

    # Clean up
    doc_rag.delete_decision_index(decision_id=999)
    assert not doc_rag.has_indexed_documents(decision_id=999)
