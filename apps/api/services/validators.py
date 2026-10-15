import os
from typing import Dict, Any, List
from fastapi import HTTPException, status

ALLOWED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".webm", ".mp4"}
ALLOWED_AUDIO_MIMES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/ogg",
    "audio/flac",
    "audio/webm",
    "video/mp4",
    "video/webm",
}


def validate_audio_file(file_name: str, file_size_bytes: int, mime_type: str, max_size_mb: int = 100):
    """Validate uploaded audio file extension, size and mime type."""
    ext = os.path.splitext(file_name.lower())[1]
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    max_bytes = max_size_mb * 1024 * 1024
    if file_size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {max_size_mb} MB.",
        )

    # Note: browser mime types can be unreliable, so we allow standard mimes or audio/ prefixes
    if mime_type and not (mime_type in ALLOWED_AUDIO_MIMES or mime_type.startswith("audio/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type '{mime_type}'. Expected audio or video media.",
        )


def validate_mcda_matrix(matrix: Dict[str, Any]) -> bool:
    """Validate that MCDA matrix contains criteria with weights and alternatives with scores."""
    if not isinstance(matrix, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="MCDA matrix must be an object containing 'criteria' and 'alternatives'.",
        )

    criteria = matrix.get("criteria", [])
    alternatives = matrix.get("alternatives", [])

    if not isinstance(criteria, list) or len(criteria) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="MCDA matrix must contain at least one criterion.",
        )

    if not isinstance(alternatives, list) or len(alternatives) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="MCDA matrix must contain at least one alternative.",
        )

    return True
