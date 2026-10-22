import io
import os
import zipfile
from typing import Optional
from fastapi import HTTPException, status
import pypdf
import docx


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}


def get_file_extension(filename: str) -> str:
    """Return normalized lowercase file extension including the dot."""
    _, ext = os.path.splitext(filename)
    return ext.lower()


def extract_text_from_file(file_bytes: bytes, filename: str, mime_type: Optional[str] = None) -> str:
    """
    Extract readable text from PDF, DOCX, TXT, and Markdown files.
    Rejects empty files, unsupported extensions, corrupted binaries, and scanned PDFs without OCR.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    ext = get_file_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Supported formats: .pdf, .docx, .txt, .md",
        )

    # 1. Plain Text and Markdown
    if ext in {".txt", ".md", ".markdown"}:
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = file_bytes.decode("latin-1")
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to decode text file. Ensure it is encoded in UTF-8 or standard ASCII.",
                )

        cleaned_text = text.strip()
        if not cleaned_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty or contains only whitespace.",
            )
        return cleaned_text

    # 2. Microsoft Word Document (.docx)
    elif ext == ".docx":
        try:
            stream = io.BytesIO(file_bytes)
            doc = docx.Document(stream)
            extracted_paragraphs = []

            for p in doc.paragraphs:
                p_text = p.text.strip()
                if p_text:
                    extracted_paragraphs.append(p_text)

            # Also extract text from tables
            for table in doc.tables:
                for row in table.rows:
                    row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if row_cells:
                        extracted_paragraphs.append(" | ".join(row_cells))

            full_text = "\n\n".join(extracted_paragraphs).strip()
            if not full_text:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Word document (.docx) contains no extractable text.",
                )
            return full_text

        except (zipfile.BadZipFile, docx.opc.exceptions.PackageNotFoundError, Exception) as exc:
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed or corrupted DOCX file: {str(exc)}",
            )

    # 3. PDF Document (.pdf)
    elif ext == ".pdf":
        try:
            stream = io.BytesIO(file_bytes)
            reader = pypdf.PdfReader(stream)

            if len(reader.pages) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="PDF contains no pages.",
                )

            extracted_pages = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    extracted_pages.append(f"--- Page {i + 1} ---\n{page_text.strip()}")

            full_text = "\n\n".join(extracted_pages).strip()

            if not full_text:
                # Scanned PDF with zero selectable text
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scanned PDF detected without selectable text. Scanned PDFs are currently unsupported as OCR is not yet implemented.",
                )

            return full_text

        except Exception as exc:
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed or unreadable PDF document: {str(exc)}",
            )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported file format '{ext}'.",
    )
