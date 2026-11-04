from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database import get_db
from app.models import User, Folder, Decision, FolderMember
from app.schemas import FolderCreate, FolderUpdate, FolderResponse, MemberResponse, MemberCreate
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

    # Explicitly cascade delete child decisions for full portability
    db.query(Decision).filter(Decision.folder_id == folder_id).delete(synchronize_session="fetch")
    db.delete(folder)
    db.commit()

    return {"status": "deleted", "id": folder_id}


@router.get(
    "/{folder_id}/members",
    response_model=List[MemberResponse],
    summary="List all allowed collaborators for a folder / workspace",
)
def list_folder_members(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all allowed users and collaborators for this workspace."""
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    # Fetch explicitly added members
    members = db.query(FolderMember).filter(FolderMember.folder_id == folder_id).all()

    # The Owner is always member #1
    owner_member = MemberResponse(
        id=0,
        folder_id=folder.id,
        user_id=folder.owner_id,
        email=current_user.email,
        display_name=current_user.display_name or current_user.email.split("@")[0],
        role="owner",
        authority_role="Lead Architect",
        status="active",
        created_at=folder.created_at,
    )

    response_list = [owner_member]
    for m in members:
        # Avoid duplicate owner if already in DB
        if m.user_id == folder.owner_id or m.email.lower() == current_user.email.lower():
            continue
        response_list.append(MemberResponse.model_validate(m))

    return response_list


@router.post(
    "/{folder_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add / invite a collaborator to this workspace",
)
def add_folder_member(
    folder_id: int,
    body: MemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add or invite a stakeholder with role and authority permissions."""
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    email_clean = body.email.strip().lower()
    if email_clean == current_user.email.lower():
        raise HTTPException(status_code=400, detail="Owner is already an active member of this workspace")

    # Check if already added
    existing = db.query(FolderMember).filter(
        FolderMember.folder_id == folder_id,
        func.lower(FolderMember.email) == email_clean,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Collaborator already added to this workspace")

    # Link user_id if already registered in system
    matched_user = db.query(User).filter(func.lower(User.email) == email_clean).first()

    member = FolderMember(
        folder_id=folder_id,
        user_id=matched_user.id if matched_user else None,
        email=email_clean,
        display_name=body.display_name.strip() if body.display_name else (matched_user.display_name if matched_user else email_clean.split("@")[0]),
        role=body.role or "editor",
        authority_role=body.authority_role or "General / Team",
        status="active" if matched_user else "invited",
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    return MemberResponse.model_validate(member)


@router.delete(
    "/{folder_id}/members/{member_id}",
    summary="Remove a collaborator from this workspace",
)
def remove_folder_member(
    folder_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a collaborator's access to this folder / workspace."""
    folder = db.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    verify_ownership(folder.owner_id, current_user.id, resource_name="Folder")

    member = db.query(FolderMember).filter(
        FolderMember.folder_id == folder_id,
        FolderMember.id == member_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    db.commit()

    return {"status": "deleted", "id": member_id}
