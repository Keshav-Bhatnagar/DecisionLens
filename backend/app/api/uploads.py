import os
import re
import uuid
from typing import List, Optional
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import User, Decision, Attachment
from app.schemas import AttachmentResponse, GoogleDriveImportRequest
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


@router.post(
    "/google-drive",
    response_model=AttachmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import a document directly from Google Drive or Google Docs",
)
async def import_google_drive(
    decision_id: int,
    payload: GoogleDriveImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Import a document from Google Drive.
    Supports:
    1. Direct Google Docs/Sheets links (e.g. https://docs.google.com/document/d/...)
    2. Google Drive Picker selection with OAuth access_token
    """
    decision = db.get(Decision, decision_id)
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    verify_ownership(decision.owner_id, current_user.id, resource_name="Decision")

    # 1. Resolve File ID
    file_id = None
    if payload.file_id and payload.file_id.strip():
        file_id = payload.file_id.strip()
    elif payload.drive_url and payload.drive_url.strip():
        url = payload.drive_url.strip()
        match = re.search(r"/(?:d|folders|file/d)/([a-zA-Z0-9_-]+)", url)
        if not match:
            match = re.search(r"[?&]id=([a-zA-Z0-9_-]+)", url)
        if match:
            file_id = match.group(1)

    if not file_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract a valid Google Drive file ID. Please provide a valid Google Docs or Drive link.",
        )

    # 2. Fetch File from Google
    file_name = payload.original_name or "Google_Drive_Doc"
    mime_type = payload.mime_type or ""
    content_bytes: Optional[bytes] = None
    extracted_text: Optional[str] = None

    async with httpx.AsyncClient(timeout=40.0, follow_redirects=True) as client:
        headers = {}
        if payload.access_token:
            headers["Authorization"] = f"Bearer {payload.access_token.strip()}"

        # If OAuth access token is provided, query Drive v3 API
        if payload.access_token:
            try:
                meta_resp = await client.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}?fields=id,name,mimeType,size",
                    headers=headers,
                )
                if meta_resp.status_code == 200:
                    meta = meta_resp.json()
                    file_name = meta.get("name", file_name)
                    mime_type = meta.get("mimeType", mime_type)
            except Exception:
                pass

            # Export Google Docs / Sheets
            if "google-apps.document" in mime_type:
                export_resp = await client.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=text/plain",
                    headers=headers,
                )
                if export_resp.status_code == 200:
                    extracted_text = export_resp.text.strip()
                    content_bytes = export_resp.content
                    if not file_name.endswith(".txt"):
                        file_name = f"{file_name}.txt"
            elif "google-apps.spreadsheet" in mime_type:
                export_resp = await client.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=text/csv",
                    headers=headers,
                )
                if export_resp.status_code == 200:
                    extracted_text = export_resp.text.strip()
                    content_bytes = export_resp.content
                    if not file_name.endswith(".csv"):
                        file_name = f"{file_name}.csv"
            elif "google-apps.presentation" in mime_type:
                export_resp = await client.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}/export?mimeType=text/plain",
                    headers=headers,
                )
                if export_resp.status_code == 200:
                    extracted_text = export_resp.text.strip()
                    content_bytes = export_resp.content
                    if not file_name.endswith(".txt"):
                        file_name = f"{file_name}.txt"
            else:
                dl_resp = await client.get(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media",
                    headers=headers,
                )
                if dl_resp.status_code == 200:
                    content_bytes = dl_resp.content

        # Direct public export fallback (when no access token or sharing is Anyone with link)
        if content_bytes is None:
            # Try Google Docs public export
            doc_export_url = f"https://docs.google.com/document/d/{file_id}/export?format=txt"
            doc_resp = await client.get(doc_export_url)
            if doc_resp.status_code == 200 and doc_resp.text and not doc_resp.text.startswith("<!DOCTYPE"):
                extracted_text = doc_resp.text.strip()
                content_bytes = doc_resp.content
                if not file_name.endswith(".txt"):
                    file_name = f"{file_name}.txt"
            else:
                # Try Google Drive public download
                drive_dl_url = f"https://drive.google.com/uc?export=download&id={file_id}"
                dl_resp = await client.get(drive_dl_url)
                if dl_resp.status_code == 200 and not dl_resp.text.startswith("<!DOCTYPE"):
                    content_bytes = dl_resp.content
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "Unable to access Google Drive document. If the document is private, "
                            "please ensure you select it through the Google Drive Picker or set sharing in Google Drive to 'Anyone with the link can view'."
                        ),
                    )

    if not content_bytes or len(content_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The Google Drive document was empty (0 bytes).",
        )

    # 3. Extract Text if not already converted from Google Docs
    ext = get_file_extension(file_name)
    if not ext:
        ext = ".txt" if "text" in mime_type else ".pdf"
        file_name = f"{file_name}{ext}"

    if extracted_text is None or not extracted_text.strip():
        extracted_text = extract_text_from_file(content_bytes, file_name, mime_type)

    # 4. Save physical copy in storage
    attachments_dir = settings.storage_path / "attachments"
    attachments_dir.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = attachments_dir / stored_filename
    dest_path.write_bytes(content_bytes)

    # 5. Record Attachment in database
    attachment = Attachment(
        owner_id=current_user.id,
        decision_id=decision.id,
        original_name=file_name,
        stored_path=str(dest_path),
        media_type=mime_type or "application/octet-stream",
        file_size=len(content_bytes),
        extracted_text=extracted_text,
    )
    db.add(attachment)

    # 6. Append to decision raw input context
    doc_header = f"\n\n[Google Drive: {file_name}]\n{extracted_text}"
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
