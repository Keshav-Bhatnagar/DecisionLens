"""
Embedding engine for DecisionLens RAG.

Two tiers:
1. Semantic embeddings from a hosted model (Azure OpenAI deployment such as
   text-embedding-3-small, or OpenAI directly). These understand meaning, so
   "budget" matches "cost" and "hire" matches "recruitment".
2. A deterministic local hashing projection (word, bigram and character
   trigram features). Zero dependencies, used when no embedding model is
   configured or the hosted model is temporarily unreachable.

Every vector is tagged with a model id. Vectors from different models are never
compared with each other; callers use the model id to keep indexes consistent.
"""

import hashlib
import logging
import math
import re
import threading
import time
from collections import OrderedDict
from typing import Callable, List, Optional, Tuple

from app.config import settings

logger = logging.getLogger("decisionlens.rag.embeddings")

LOCAL_MODEL_PREFIX = "local-hash"
REMOTE_BATCH_SIZE = 64
REMOTE_COOLDOWN_SECONDS = 60.0
CACHE_MAX_ITEMS = 4096
MAX_INPUT_CHARS = 8000  # stay well under the 8k token limit of embedding models

RemoteEncoder = Callable[[List[str]], List[List[float]]]


def _normalize(vector: List[float]) -> List[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    if norm > 0:
        return [v / norm for v in vector]
    return vector


class EmbeddingEngine:
    """
    Embedding engine supporting dense API-backed semantic embeddings with a
    deterministic local fallback.

    - encode / encode_batch keep the original interface (vectors only).
    - encode_with_model / encode_batch_with_model also return the model id used.
    - encode_for_model encodes with one specific model, or returns None if that
      model is unavailable, so stored indexes are never mixed.
    """

    def __init__(
        self,
        dimension: Optional[int] = None,
        use_remote: Optional[bool] = None,
        remote_encoder: Optional[RemoteEncoder] = None,
        remote_model_name: Optional[str] = None,
    ):
        self.dimension = int(dimension or settings.embedding_dimensions or 1536)
        # use_remote=None means "decide from settings"
        self._use_remote = use_remote
        self._remote_encoder = remote_encoder
        self._remote_model_name = remote_model_name
        self._client = None
        self._client_kind: Optional[str] = None
        self._send_dimensions = True
        self._cooldown_until = 0.0
        self._last_error: Optional[str] = None
        self._cache: "OrderedDict[Tuple[str, str], List[float]]" = OrderedDict()
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Model identity
    # ------------------------------------------------------------------
    @property
    def local_model_id(self) -> str:
        return f"{LOCAL_MODEL_PREFIX}@{self.dimension}"

    def _remote_provider(self) -> Optional[str]:
        """Resolve which hosted embedding provider to use, if any."""
        if self._remote_encoder is not None:
            return "custom"
        if self._use_remote is False:
            return None

        pref = (settings.embedding_provider or "auto").strip().lower()
        if pref in {"local", "none", "off", "mock"}:
            return None

        azure_ready = bool(
            settings.azure_openai_embedding_deployment.strip()
            and (settings.azure_openai_embedding_api_key or settings.azure_openai_api_key).strip()
            and (settings.azure_openai_embedding_endpoint or settings.azure_openai_endpoint).strip()
        )
        openai_ready = bool(settings.openai_api_key.strip() and settings.openai_embedding_model.strip())

        if pref in {"azure", "azure_openai"}:
            return "azure" if azure_ready else None
        if pref == "openai":
            return "openai" if openai_ready else None
        # auto: Azure first, then OpenAI
        if azure_ready:
            return "azure"
        if openai_ready:
            return "openai"
        return None

    @property
    def remote_model_id(self) -> Optional[str]:
        provider = self._remote_provider()
        if provider is None:
            return None
        if provider == "custom":
            name = self._remote_model_name or "custom"
        elif provider == "azure":
            name = f"azure:{settings.azure_openai_embedding_deployment.strip()}"
        else:
            name = f"openai:{settings.openai_embedding_model.strip()}"
        return f"{name}@{self.dimension}"

    def remote_available(self) -> bool:
        return self.remote_model_id is not None and time.monotonic() >= self._cooldown_until

    def preferred_model_id(self) -> str:
        """The model new vectors should use right now."""
        if self.remote_available():
            return self.remote_model_id  # type: ignore[return-value]
        return self.local_model_id

    def is_semantic(self, model_id: Optional[str] = None) -> bool:
        mid = model_id or self.preferred_model_id()
        return not mid.startswith(LOCAL_MODEL_PREFIX)

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    # ------------------------------------------------------------------
    # Public encoding API
    # ------------------------------------------------------------------
    def encode(self, text: str) -> List[float]:
        """Generate a unit-normalized dense float vector for text."""
        return self.encode_with_model(text)[0]

    def encode_batch(self, texts: List[str]) -> List[List[float]]:
        """Batch encode list of texts into dense vectors (single consistent model)."""
        return self.encode_batch_with_model(texts)[0]

    def encode_with_model(self, text: str) -> Tuple[List[float], str]:
        vectors, model_id = self.encode_batch_with_model([text])
        return vectors[0], model_id

    def encode_batch_with_model(self, texts: List[str]) -> Tuple[List[List[float]], str]:
        """
        Encode all texts with the same model. Uses the hosted model when it is
        configured and healthy; if any part of the call fails, every text falls
        back to the local model so the batch stays consistent.
        """
        if not texts:
            return [], self.preferred_model_id()
        if self.remote_available():
            remote_id = self.remote_model_id
            vectors = self._encode_remote_cached(texts, remote_id)  # type: ignore[arg-type]
            if vectors is not None:
                return vectors, remote_id  # type: ignore[return-value]
        return [self.local_encode(t) for t in texts], self.local_model_id

    def encode_for_model(self, texts: List[str], model_id: str) -> Optional[List[List[float]]]:
        """Encode with one specific model id, or return None if it can't be used now."""
        if model_id == self.local_model_id:
            return [self.local_encode(t) for t in texts]
        if model_id == self.remote_model_id and self.remote_available():
            return self._encode_remote_cached(texts, model_id)
        return None

    def local_encode(self, text: str) -> List[float]:
        key = (self.local_model_id, self._text_key(text))
        cached = self._cache_get(key)
        if cached is not None:
            return cached
        vec = self._local_dense_vector(text)
        self._cache_put(key, vec)
        return vec

    # ------------------------------------------------------------------
    # Hosted model
    # ------------------------------------------------------------------
    def _encode_remote_cached(self, texts: List[str], model_id: str) -> Optional[List[List[float]]]:
        results: List[Optional[List[float]]] = [None] * len(texts)
        missing_idx: List[int] = []
        for i, t in enumerate(texts):
            cached = self._cache_get((model_id, self._text_key(t)))
            if cached is not None:
                results[i] = cached
            else:
                missing_idx.append(i)

        if missing_idx:
            try:
                to_encode = [self._prepare_input(texts[i]) for i in missing_idx]
                fresh: List[List[float]] = []
                for start in range(0, len(to_encode), REMOTE_BATCH_SIZE):
                    fresh.extend(self._call_remote(to_encode[start : start + REMOTE_BATCH_SIZE]))
                if len(fresh) != len(missing_idx):
                    raise RuntimeError("Embedding response size mismatch")
                for i, vec in zip(missing_idx, fresh):
                    if len(vec) != self.dimension:
                        raise RuntimeError(
                            f"Embedding model returned {len(vec)} dimensions but EMBEDDING_DIMENSIONS={self.dimension}. "
                            f"Set EMBEDDING_DIMENSIONS={len(vec)} or use a text-embedding-3 model."
                        )
                    vec = _normalize(vec)
                    results[i] = vec
                    self._cache_put((model_id, self._text_key(texts[i])), vec)
                self._last_error = None
            except Exception as exc:
                self._last_error = f"{exc.__class__.__name__}: {str(exc)[:200]}"
                self._cooldown_until = time.monotonic() + REMOTE_COOLDOWN_SECONDS
                logger.warning(
                    "Hosted embedding call failed (%s). Using local embeddings for %ss.",
                    self._last_error,
                    int(REMOTE_COOLDOWN_SECONDS),
                )
                return None

        return [r for r in results if r is not None]

    def _call_remote(self, batch: List[str]) -> List[List[float]]:
        if self._remote_encoder is not None:
            return self._remote_encoder(batch)

        client, model = self._get_client()
        kwargs = {"model": model, "input": batch}
        if self._send_dimensions:
            kwargs["dimensions"] = self.dimension
        try:
            response = client.embeddings.create(**kwargs)
        except Exception as exc:
            # Older models (e.g. text-embedding-ada-002) reject the dimensions parameter
            if self._send_dimensions and "dimension" in str(exc).lower():
                self._send_dimensions = False
                kwargs.pop("dimensions", None)
                response = client.embeddings.create(**kwargs)
            else:
                raise
        data = sorted(response.data, key=lambda d: d.index)
        return [list(d.embedding) for d in data]

    def _get_client(self):
        provider = self._remote_provider()
        with self._lock:
            if self._client is None or self._client_kind != provider:
                if provider == "azure":
                    from openai import AzureOpenAI

                    self._client = AzureOpenAI(
                        api_key=(settings.azure_openai_embedding_api_key or settings.azure_openai_api_key).strip(),
                        azure_endpoint=(settings.azure_openai_embedding_endpoint or settings.azure_openai_endpoint).strip(),
                        api_version=(
                            settings.azure_openai_embedding_api_version
                            or settings.azure_openai_api_version
                            or "2024-08-01-preview"
                        ).strip(),
                        timeout=20.0,
                        max_retries=1,
                    )
                elif provider == "openai":
                    from openai import OpenAI

                    self._client = OpenAI(api_key=settings.openai_api_key.strip(), timeout=20.0, max_retries=1)
                else:
                    raise RuntimeError("No hosted embedding provider configured")
                self._client_kind = provider
        model = (
            settings.azure_openai_embedding_deployment.strip()
            if provider == "azure"
            else settings.openai_embedding_model.strip()
        )
        return self._client, model

    # ------------------------------------------------------------------
    # Local deterministic projection
    # ------------------------------------------------------------------
    def _local_dense_vector(self, text: str) -> List[float]:
        """
        Deterministic, unit-normalized feature projection.
        Extracts word tokens, bigrams, and character tri-grams to capture
        both lexical overlap and morphological similarity.
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

        return _normalize(vector)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _prepare_input(text: str) -> str:
        cleaned = (text or "").replace("\x00", " ").strip()
        return cleaned[:MAX_INPUT_CHARS] if cleaned else " "

    @staticmethod
    def _text_key(text: str) -> str:
        return hashlib.sha1((text or "").encode("utf-8")).hexdigest()

    def _cache_get(self, key: Tuple[str, str]) -> Optional[List[float]]:
        with self._lock:
            vec = self._cache.get(key)
            if vec is not None:
                self._cache.move_to_end(key)
            return vec

    def _cache_put(self, key: Tuple[str, str], vec: List[float]) -> None:
        with self._lock:
            self._cache[key] = vec
            self._cache.move_to_end(key)
            while len(self._cache) > CACHE_MAX_ITEMS:
                self._cache.popitem(last=False)


_default_embedding_engine: Optional[EmbeddingEngine] = None


def get_embedding_engine() -> EmbeddingEngine:
    global _default_embedding_engine
    if _default_embedding_engine is None:
        _default_embedding_engine = EmbeddingEngine()
    return _default_embedding_engine


def cosine(a: List[float], b: List[float]) -> float:
    """Dot product of unit-normalized vectors = cosine similarity."""
    return sum(x * y for x, y in zip(a, b))
