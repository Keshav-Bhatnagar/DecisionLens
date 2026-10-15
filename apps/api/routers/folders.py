from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from apps.api.core.database import get_db
from apps.api.models.database import Folder
from apps.api.models.schemas import FolderCreate, FolderUpdate, FolderResponse

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.get("", response_model=List[FolderResponse])
def list_folders(parent_id: Optional[str] = None, db: Session = Depends(get_db)):
    """List folders, optionally filtered by parent_id."""
    query = db.query(Folder)
    if parent_id is not None:
        query = query.filter(Folder.parent_id == parent_id)
    return query.order_by(Folder.created_at.desc()).all()


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(folder_in: FolderCreate, db: Session = Depends(get_db)):
    """Create a new folder for organizing decision sessions."""
    if folder_in.parent_id:
        parent = db.query(Folder).filter(Folder.id == folder_in.parent_id).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent folder '{folder_in.parent_id}' not found.",
            )

    folder = Folder(
        name=folder_in.name,
        description=folder_in.description,
        parent_id=folder_in.parent_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderResponse)
def get_folder(folder_id: str, db: Session = Depends(get_db)):
    """Get single folder details by ID."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder '{folder_id}' not found.",
        )
    return folder


@router.put("/{folder_id}", response_model=FolderResponse)
def update_folder(folder_id: str, folder_in: FolderUpdate, db: Session = Depends(get_db)):
    """Update folder properties."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder '{folder_id}' not found.",
        )

    if folder_in.name is not None:
        folder.name = folder_in.name
    if folder_in.description is not None:
        folder.description = folder_in.description
    if folder_in.parent_id is not None:
        folder.parent_id = folder_in.parent_id

    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    """Delete a folder and cascade delete child folders and sessions."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder '{folder_id}' not found.",
        )
    db.delete(folder)
    db.commit()
    return None
