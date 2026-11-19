import pytest
from app.services.rag.domain_rag import DomainRAGService, get_domain_rag_service
from app.services.rag.router import DomainRouter, DomainType
from app.services.rag.answer import answer_question


def test_tech_domain_knowledge_base_indexing():
    service = DomainRAGService()
    # Force reindexing to pick up the enriched software.md
    service.initialize_knowledge_bases(force=True)

    # 1. Test Cloud Pricing & NAT Gateway Traps
    nat_results = service.retrieve_domain_blind_spots(
        DomainType.SOFTWARE, "AWS NAT Gateway monthly cost and data transfer", top_k=2
    )
    assert len(nat_results) > 0
    assert any("NAT Gateway" in r["content"] or "32.40" in r["content"] or "Egress" in r["content"] for r in nat_results)

    # 2. Test Serverless vs Kubernetes Cost Break-Even
    serverless_results = service.retrieve_domain_blind_spots(
        DomainType.SOFTWARE, "AWS Lambda vs EKS cluster control plane pricing break-even", top_k=2
    )
    assert len(serverless_results) > 0
    assert any("Lambda" in r["content"] or "EKS" in r["content"] or "73" in r["content"] or "0.20 per 1M" in r["content"] for r in serverless_results)

    # 3. Test Database Connection Pooling & Hardware Latency
    db_results = service.retrieve_domain_blind_spots(
        DomainType.SOFTWARE, "PostgreSQL connection pool PgBouncer formula and RAM per process", top_k=2
    )
    assert len(db_results) > 0
    assert any("PgBouncer" in r["content"] or "Pool Size" in r["content"] or "10MB" in r["content"] for r in db_results)

    # 4. Test Zero-Downtime Database Migration Standards
    migration_results = service.retrieve_domain_blind_spots(
        DomainType.SOFTWARE, "Two-phase expand and contract zero downtime schema migration", top_k=2
    )
    assert len(migration_results) > 0
    assert any("Expand" in r["content"] or "Contract" in r["content"] or "migration" in r["content"].lower() for r in migration_results)


def test_tech_domain_routing():
    router = DomainRouter()

    domain, conf = router.classify("We need to decide between AWS Lambda and Kubernetes EKS with auto-scaling.")
    assert domain == DomainType.SOFTWARE
    assert conf > 0.6

    domain, conf = router.classify("PostgreSQL connection pooling with PgBouncer vs Supavisor for high traffic.")
    assert domain == DomainType.SOFTWARE
    assert conf > 0.6


def test_answer_question_with_tech_standards(db_session):
    # Initialize domain knowledge
    get_domain_rag_service().initialize_knowledge_bases(force=True)

    # Ask an architectural / pricing question even when no documents are uploaded yet
    result = answer_question(
        decision_id=1,
        question="What is the cost of an AWS NAT Gateway and how can we avoid data charges?",
        decision_title="Microservices VPC Architecture",
        domain="software",
        include_tech_standards=True,
    )

    # Verify that the answer was grounded in technical standards
    assert result["covered"] is True
    assert len(result["citations"]) > 0
    assert any("NAT" in c["content"] or "Gateway" in c["content"] for c in result["citations"])
    assert any("Technical Architecture" in c["document_name"] for c in result["citations"])
    assert "NAT" in result["answer"] or "gateway" in result["answer"].lower()
