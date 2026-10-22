from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database import get_db
from app.models import User, Folder, Decision
from app.schemas import FolderCreate, FolderUpdate, FolderResponse
from app.auth import get_current_user, verify_ownership

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.post(
    "",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new folder",
)
def create_folder(
    body: FolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new folder in the authenticated user's workspace."""
    folder = Folder(
        owner_id=current_user.id,
        name=body.name.strip(),
        description=body.description.strip() if body.description else "",
        color=body.color or "#4F46E5",
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    response = FolderResponse.model_validate(folder)
    response.decision_count = 0
    return response


@router.get(
    "",
    response_model=List[FolderResponse],
    summary="List all folders for current user",
)
def list_folders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all folders belonging to the authenticated user with decision counts."""
    # Query folders with decision count in a single query
    stmt = (
        select(Folder, func.count(Decision.id).label("decision_count"))
        .outerjoin(Decision, Decision.folder_id == Folder.id)
        .where(Folder.owner_id == current_user.id)
        .group_by(Folder.id)
        .order_by(Folder.created_at.desc())
    )
    results = db.execute(stmt).all()

    folders_response = []
    for folder, count in results:
        res = FolderResponse.model_validate(folder)
        res.decision_count = count
        folders_response.append(res)

    return folders_response


@router.get(
    "/{folder_id}",
    response_model=FolderResponse,
    summary="Get folder by ID",
)
def get_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details for a single folder, strictly enforcing user ownership."""
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    # Count decisions in this folder
    count = db.scalar(
        select(func.count(Decision.id)).where(Decision.folder_id == folder.id)
    ) or 0

    response = FolderResponse.model_validate(folder)
    response.decision_count = count
    return response


@router.patch(
    "/{folder_id}",
    response_model=FolderResponse,
    summary="Update folder",
)
def update_folder(
    folder_id: int,
    body: FolderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a folder's name, description, or color."""
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    if body.name is not None:
        folder.name = body.name.strip()
    if body.description is not None:
        folder.description = body.description.strip()
    if body.color is not None:
        folder.color = body.color

    db.commit()
    db.refresh(folder)

    count = db.scalar(
        select(func.count(Decision.id)).where(Decision.folder_id == folder.id)
    ) or 0

    response = FolderResponse.model_validate(folder)
    response.decision_count = count
    return response


@router.delete(
    "/{folder_id}",
    summary="Delete folder and cascade to its decisions",
)
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a folder and all decisions contained inside it."""
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    db.delete(folder)
    db.commit()

    return {"status": "deleted", "id": folder_id}
