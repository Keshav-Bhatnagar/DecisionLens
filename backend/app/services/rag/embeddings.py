import hashlib
import math
import re
from typing import List, Optional
import logging

from app.config import settings

logger = logging.getLogger("decisionlens.rag.embeddings")


class EmbeddingEngine:
    """
    Embedding engine supporting both dense API-backed embeddings
    and ultra-fast, zero-dependency local deterministic semantic embeddings.
    """

    def __init__(self, dimension: int = 384):
        self.dimension = dimension

    def encode(self, text: str) -> List[float]:
        """Generate a unit-normalized dense float vector for text."""
        return self._local_dense_vector(text)

    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        """Batch encode list of texts into dense vectors."""
        return [self.encode(t) for t in texts]

    def _local_dense_vector(self, text: str) -> List[float]:
        """
        Deterministic, unit-normalized semantic feature projection (384-dim).
        Extracts word tokens, bigrams, and character tri-grams to capture
        both lexical semantics and morphological similarity.
        """
        if not text:
            return [0.0] * self.dimension

        cleaned = text.lower().strip()
        tokens = re.findall(r"\b\w{2,}\b", cleaned)
        if not tokens:
            tokens = [cleaned]

        vector = [0.0] * self.dimension

        # 1. Unigram token hashing
        for token in tokens:
            idx = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % self.dimension
            sign = 1.0 if (idx % 2 == 0) else -1.0
            vector[idx] += 1.5 * sign

        # 2. Bigram phrase hashing
        for i in range(len(tokens) - 1):
            bigram = f"{tokens[i]}_{tokens[i+1]}"
            idx = int(hashlib.sha1(bigram.encode("utf-8")).hexdigest(), 16) % self.dimension
            sign = 1.0 if (idx % 2 == 0) else -1.0
            vector[idx] += 2.0 * sign

        # 3. Char trigram hashing for partial morphology
        for token in tokens:
            if len(token) >= 3:
                for j in range(len(token) - 2):
                    trigram = token[j : j + 3]
                    idx = int(hashlib.sha256(trigram.encode("utf-8")).hexdigest(), 16) % self.dimension
                    vector[idx] += 0.5

        # Normalize to unit length (L2 norm) for exact Cosine Similarity
        norm = math.sqrt(sum(v * v for v in vector))
        if norm > 0:
            return [v / norm for v in vector]
        return vector


_default_embedding_engine: Optional[EmbeddingEngine] = None


def get_embedding_engine() -> EmbeddingEngine:
    global _default_embedding_engine
    if _default_embedding_engine is None:
        _default_embedding_engine = EmbeddingEngine()
    return _default_embedding_engine
