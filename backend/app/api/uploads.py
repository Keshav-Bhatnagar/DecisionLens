import os
import uuid
from typing import List
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import User, Decision, Attachment
from app.schemas import AttachmentResponse
from app.auth import get_current_user, verify_ownership
from app.services.file_parser import extract_text_from_file, get_file_extension, ALLOWED_EXTENSIONS

router = APIRouter(prefix="/decisions/{decision_id}/attachments", tags=["Document Uploads"])


@router.post(
    "",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document and extract its text",
)
async def upload_attachment(
    decision_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a document (.pdf, .docx, .txt, .md), validate file constraints,
    extract text content, and store attachment metadata.
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    original_filename = file.filename or "uploaded_file"
    ext = get_file_extension(original_filename)

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: .pdf, .docx, .txt, .md",
        )

    # Read file content with size validation
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File size ({file_size / (1024 * 1024):.1f}MB) exceeds the maximum allowed limit of {settings.max_upload_mb}MB.",
        )

    # Extract text from document
    extracted_text = extract_text_from_file(content, original_filename, file.content_type)

    # Save physical file using a generated UUID filename in secure storage
    attachments_dir = settings.storage_path / "attachments"
    attachments_dir.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = attachments_dir / stored_filename
    dest_path.write_bytes(content)

    # Record in database
    attachment = Attachment(
        owner_id=current_user.id,
        decision_id=decision.id,
        original_name=original_filename,
        stored_path=str(dest_path),
        media_type=file.content_type or "application/octet-stream",
        file_size=file_size,
        extracted_text=extracted_text,
    )
    db.add(attachment)

    # Append to decision raw input context for upcoming structuring
    doc_header = f"\n\n[Document: {original_filename}]\n{extracted_text}"
    if decision.raw_input:
        decision.raw_input += doc_header
    else:
        decision.raw_input = doc_header.strip()

    db.commit()
    db.refresh(attachment)

    return AttachmentResponse.model_validate(attachment)


@router.get(
    "",
    response_model=List[AttachmentResponse],
    summary="List attachments for a decision",
)
def list_attachments(
    decision_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all uploaded document attachments for a decision."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    stmt = (
        select(Attachment)
        .where(Attachment.decision_id == decision_id, Attachment.owner_id == current_user.id)
        .order_by(Attachment.created_at.desc())
    )
    attachments = db.scalars(stmt).all()
    return [AttachmentResponse.model_validate(a) for a in attachments]


@router.get(
    "/{attachment_id}",
    response_model=AttachmentResponse,
    summary="Get single attachment details with extracted text",
)
def get_attachment(
    decision_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details and extracted text for an attachment."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    attachment = db.get(Attachment, attachment_id)
    if not attachment or attachment.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    verify_ownership(attachment.owner_id, current_user.id, resource_name="Attachment")
    return AttachmentResponse.model_validate(attachment)


@router.delete(
    "/{attachment_id}",
    summary="Delete an attachment",
)
def delete_attachment(
    decision_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an attachment record and remove the stored file."""
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    attachment = db.get(Attachment, attachment_id)
    if not attachment or attachment.decision_id != decision_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    verify_ownership(attachment.owner_id, current_user.id, resource_name="Attachment")

    # Safely remove physical file
    try:
        p = Path(attachment.stored_path)
        if p.is_file():
            p.unlink()
    except Exception:
        pass

    db.delete(attachment)
    db.commit()

    return {"status": "deleted", "id": attachment_id}
