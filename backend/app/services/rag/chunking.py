import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class TextChunk:
    id: str
    content: str
    metadata: dict
    start_char: int
    end_char: int
    chunk_index: int


class TextChunker:
    """
    Semantic text chunker with paragraph and heading awareness.
    Splits documents into overlapping chunks while preserving sentence boundaries.
    """

    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 100,
        min_chunk_size: int = 80,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size

    def split_text(
        self,
        text: str,
        document_id: str = "doc",
        base_metadata: Optional[dict] = None,
    ) -> List[TextChunk]:
        if not text or not text.strip():
            return []

        clean_text = text.strip()
        metadata = base_metadata or {}

        # First, split into natural paragraphs or sections
        paragraphs = re.split(r"\n\s*\n", clean_text)
        chunks: List[TextChunk] = []

        current_buffer = ""
        current_start = 0
        chunk_idx = 0

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # If paragraph itself is larger than chunk_size, split by sentences
            if len(para) > self.chunk_size:
                sentences = re.split(r"(?<=[.!?])\s+", para)
                for sentence in sentences:
                    sentence = sentence.strip()
                    if not sentence:
                        continue

                    if len(current_buffer) + len(sentence) + 1 > self.chunk_size:
                        if len(current_buffer) >= self.min_chunk_size:
                            end_char = current_start + len(current_buffer)
                            chunks.append(
                                TextChunk(
                                    id=f"{document_id}_chunk_{chunk_idx}",
                                    content=current_buffer.strip(),
                                    metadata={**metadata, "chunk_index": chunk_idx},
                                    start_char=current_start,
                                    end_char=end_char,
                                    chunk_index=chunk_idx,
                                )
                            )
                            chunk_idx += 1
                            # Retain overlap from end of current buffer
                            overlap_len = min(len(current_buffer), self.chunk_overlap)
                            current_buffer = current_buffer[-overlap_len:] + " " + sentence
                            current_start = end_char - overlap_len
                        else:
                            current_buffer += " " + sentence
                    else:
                        current_buffer = (
                            f"{current_buffer} {sentence}".strip()
                            if current_buffer
                            else sentence
                        )
            else:
                if len(current_buffer) + len(para) + 2 > self.chunk_size:
                    if len(current_buffer) >= self.min_chunk_size:
                        end_char = current_start + len(current_buffer)
                        chunks.append(
                            TextChunk(
                                id=f"{document_id}_chunk_{chunk_idx}",
                                content=current_buffer.strip(),
                                metadata={**metadata, "chunk_index": chunk_idx},
                                start_char=current_start,
                                end_char=end_char,
                                chunk_index=chunk_idx,
                            )
                        )
                        chunk_idx += 1
                        overlap_len = min(len(current_buffer), self.chunk_overlap)
                        current_buffer = current_buffer[-overlap_len:] + "\n\n" + para
                        current_start = end_char - overlap_len
                    else:
                        current_buffer += "\n\n" + para
                else:
                    current_buffer = (
                        f"{current_buffer}\n\n{para}".strip()
                        if current_buffer
                        else para
                    )

        # Flush remaining buffer
        if current_buffer.strip() and len(current_buffer.strip()) >= 20:
            end_char = current_start + len(current_buffer)
            chunks.append(
                TextChunk(
                    id=f"{document_id}_chunk_{chunk_idx}",
                    content=current_buffer.strip(),
                    metadata={**metadata, "chunk_index": chunk_idx},
                    start_char=current_start,
                    end_char=end_char,
                    chunk_index=chunk_idx,
                )
            )

        return chunks
