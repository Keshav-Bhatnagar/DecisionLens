"""Tests for hosted embeddings, model-consistent search, cited answers, and RAG endpoints."""

import json
from types import SimpleNamespace
from typing import List

import pytest
from sqlalchemy.orm import Session

from app.models import Attachment, Decision, Folder
from app.services.rag import answer as answer_mod
from app.services.rag.chunking import TextChunk
from app.services.rag.embeddings import EmbeddingEngine, cosine
from app.services.rag.vector_store import InMemoryVectorStore


# ---------------------------------------------------------------------------
# Fake hosted embedding model: maps synonyms onto shared concept axes so that
# "budget" and "cost" land close together, the way a real embedding model would.
# ---------------------------------------------------------------------------
CONCEPTS = {
    0: {"budget", "cost", "costs", "spend", "price", "expensive"},
    1: {"hire", "hiring", "recruit", "recruitment", "staff", "headcount"},
    2: {"vendor", "supplier", "contract"},
}


def fake_remote(texts: List[str]) -> List[List[float]]:
    out = []
    for t in texts:
        words = {w.strip(".,?!").lower() for w in t.split()}
        vec = [0.0] * 16
        for axis, vocab in CONCEPTS.items():
            vec[axis] = float(len(words & vocab))
        vec[15] = 0.05
        out.append(vec)
    return out


def _engine(**kw) -> EmbeddingEngine:
    return EmbeddingEngine(dimension=16, remote_encoder=fake_remote, remote_model_name="fake", **kw)


def test_remote_embeddings_capture_meaning():
    eng = _engine()
    (q, a, b), model = eng.encode_batch_with_model(
        ["What is the budget?", "Total cost is 40k per year", "We will recruit two engineers"]
    )
    assert model == "fake@16"
    assert eng.is_semantic(model)
    assert cosine(q, a) > cosine(q, b)


def test_remote_failure_falls_back_to_local_consistently():
    def broken(texts):
        raise RuntimeError("Azure unavailable")

    eng = EmbeddingEngine(dimension=16, remote_encoder=broken, remote_model_name="fake")
    vectors, model = eng.encode_batch_with_model(["a budget", "a cost"])
    assert model == eng.local_model_id
    assert len(vectors) == 2 and all(len(v) == 16 for v in vectors)
    assert not eng.is_semantic(model)
    assert eng.last_error
    # Cooldown: the next call goes straight to local without retrying the remote model
    assert eng.preferred_model_id() == eng.local_model_id


def _chunk(cid: str, text: str, i: int) -> TextChunk:
    return TextChunk(id=cid, content=text, metadata={}, start_char=0, end_char=len(text), chunk_index=i)


def test_vector_store_semantic_search_finds_synonyms():
    eng = _engine()
    store = InMemoryVectorStore(embedding_engine=eng)
    chunks = [_chunk("c1", "Total cost is 40k per year", 0), _chunk("c2", "We will recruit two engineers", 1)]
    vectors, model = eng.encode_batch_with_model([c.content for c in chunks])
    store.add_chunks("col", chunks, vectors=vectors, model_id=model)
    results = store.similarity_search("col", "what is the budget", top_k=1)
    assert results[0]["id"] == "c1"


def test_vector_store_handles_mixed_models_without_crashing():
    eng = _engine()
    store = InMemoryVectorStore(embedding_engine=eng)
    store.add_chunks("col", [_chunk("old", "Annual cost of the lease", 0)], vectors=[[1.0] + [0.0] * 15], model_id="other@16")
    new = [_chunk("new", "We will recruit two engineers", 1)]
    vectors, model = eng.encode_batch_with_model([c.content for c in new])
    store.add_chunks("col", new, vectors=vectors, model_id=model)
    assert len(store.collection_model_ids("col")) == 2
    results = store.similarity_search("col", "lease cost", top_k=2)
    assert {r["id"] for r in results} == {"old", "new"}


def test_citation_renumbering_drops_unused_and_out_of_range():
    text, order = answer_mod._renumber_citations("Rent is 2k [3]. Deposit is 1 month [1][3]. Ignore [9].", 4)
    assert order == [3, 1]
    assert "[1]" in text and "[2]" in text and "[3]" not in text and "[9]" not in text


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------
@pytest.fixture
def decision_with_docs(db_session: Session, registered_user: dict):
    user = registered_user["user"]
    folder = Folder(name="Ops", owner_id=user.id)
    db_session.add(folder)
    db_session.commit()
    db_session.refresh(folder)
    dec = Decision(owner_id=user.id, folder_id=folder.id, title="Choose an office vendor", problem_statement="Pick a cleaning vendor")
    db_session.add(dec)
    db_session.commit()
    db_session.refresh(dec)
    for name, text in [
        ("vendor_quote.pdf", "The annual cost of the cleaning contract is 18,000 dollars. Notice period is 60 days."),
        ("team_notes.txt", "Facilities wants weekend coverage. The current supplier missed three visits in March."),
    ]:
        db_session.add(
            Attachment(
                owner_id=user.id,
                decision_id=dec.id,
                original_name=name,
                stored_path=f"/tmp/{name}",
                media_type="text/plain",
                file_size=len(text),
                extracted_text=text,
            )
        )
    db_session.commit()
    return dec


def _auth(user: dict) -> dict:
    return {"Authorization": f"Bearer {user['token']}"}


def test_reindex_status_and_ask_extractive(client, registered_user, decision_with_docs, monkeypatch):
    monkeypatch.setattr(answer_mod, "_call_llm", lambda prompt: None)
    dec_id = decision_with_docs.id
    headers = _auth(registered_user)

    r = client.post(f"/api/decisions/{dec_id}/rag/reindex", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["chunk_count"] >= 2

    s = client.get(f"/api/decisions/{dec_id}/rag/status", headers=headers).json()
    assert s["has_indexed_documents"] is True
    assert s["document_count"] == 2
    assert s["stale_chunks"] == 0
    assert s["embedding_model"]

    a = client.post(
        f"/api/decisions/{dec_id}/rag/ask",
        json={"question": "What is the notice period of the cleaning contract?"},
        headers=headers,
    )
    assert a.status_code == 200, a.text
    body = a.json()
    assert body["covered"] is True
    assert body["engine"] == "extractive"
    assert body["citations"] and body["citations"][0]["index"] == 1
    assert body["citations"][0]["document_name"] == "vendor_quote.pdf"
    assert "[1]" in body["answer"]


def test_ask_with_llm_renumbers_and_flags_uncited(client, registered_user, decision_with_docs, monkeypatch):
    dec_id = decision_with_docs.id
    headers = _auth(registered_user)
    client.post(f"/api/decisions/{dec_id}/rag/reindex", headers=headers)

    captured = {}

    def fake_llm(prompt):
        captured["prompt"] = prompt
        n = prompt.count('] (from "')
        captured["n"] = n
        # Cite only the LAST source, so renumbering must turn it into [1]
        return json.dumps({"answer": f"The contract costs 18,000 dollars a year [{n}].", "covered": True}), "fake:model"

    monkeypatch.setattr(answer_mod, "_call_llm", fake_llm)
    body = client.post(
        f"/api/decisions/{dec_id}/rag/ask", json={"question": "How much does the cleaning contract cost?", "top_k": 2}, headers=headers
    ).json()
    assert "<UNTRUSTED_SOURCES>" in captured["prompt"]
    assert body["covered"] is True
    assert body["engine"] == "fake:model"
    assert body["answer"].endswith("[1].")
    assert len(body["citations"]) == 1 and body["citations"][0]["index"] == 1

    # An answer without any citation is treated as not grounded
    monkeypatch.setattr(
        answer_mod, "_call_llm", lambda p: (json.dumps({"answer": "Probably fine.", "covered": True}), "fake:model")
    )
    body = client.post(f"/api/decisions/{dec_id}/rag/ask", json={"question": "Is the vendor good?"}, headers=headers).json()
    assert body["covered"] is False
    assert body["citations"] == []


def test_ask_requires_ownership(client, db_session, registered_user, decision_with_docs):
    from app.auth import create_token, hash_password
    from app.models import User

    other = User(email="other@example.com", password_hash=hash_password("Another123!"))
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    r = client.post(
        f"/api/decisions/{decision_with_docs.id}/rag/ask",
        json={"question": "What is the cost?"},
        headers={"Authorization": f"Bearer {create_token(other.id)}"},
    )
    assert r.status_code == 404


def test_bulk_reindex(client, registered_user, decision_with_docs):
    r = client.post("/api/rag/reindex", headers=_auth(registered_user))
    assert r.status_code == 200, r.text
    assert r.json()["decisions_reindexed"] >= 1
    assert r.json()["chunk_count"] >= 2


def test_gap_prompt_includes_domain_reference():
    from app.services.gaps import build_domain_reference_block

    dec = SimpleNamespace(
        title="Migrate our API to microservices",
        domain="SOFTWARE",
    )
    block = build_domain_reference_block(dec, "We plan to split the monolith API into services and change the database.")
    assert "OPTIONAL DOMAIN EXPERT REFERENCE (software)" in block
    assert "domain_guideline" in block
    assert "NOT a checklist" in block
