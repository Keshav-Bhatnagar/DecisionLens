from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import jwt

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

# Argon2 password hasher
password_hasher = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=True)
optional_bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a plain text password using Argon2."""
    return password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against an Argon2 hash."""
    return password_hasher.verify(plain_password, hashed_password)


def create_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """Generate a signed JWT token."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.access_token_expire_minutes)

    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.algorithm)


def create_password_reset_token(user_id: int, email: str, expires_minutes: int = 15) -> str:
    """Generate a short-lived, purpose-scoped JWT for password reset."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "purpose": "password_reset",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.algorithm)


def verify_password_reset_token(token: str) -> Dict[str, Any]:
    """Decode and validate a password-reset JWT, rejecting session tokens."""
    payload = decode_token(token)
    if payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset token",
        )
    return payload


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate a signed JWT token."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.algorithm],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Dependency for securing endpoints with Bearer JWT tokens or HttpOnly cookie fallback."""
    raw_token = (credentials.credentials if credentials else None) or request.cookies.get("access_token")
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(raw_token)
    if payload.get("purpose") == "password_reset":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_raw = payload.get("sub")
    if not user_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_user_from_header_or_query(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> User:
    """Dependency supporting standard Bearer header, query param token, OR HttpOnly cookie fallback."""
    raw_token = (credentials.credentials if credentials else None) or token or request.cookies.get("access_token")
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(raw_token)
    if payload.get("purpose") == "password_reset":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_raw = payload.get("sub")
    if not user_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = int(user_id_raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def verify_ownership(
    resource_owner_id: int,
    current_user_id: int,
    resource_name: str = "Resource",
) -> None:
    """
    Enforces strict user isolation across all protected resources.
    Returns HTTP 404 (Not Found) rather than 403 (Forbidden) upon ownership
    mismatch to prevent identifier enumeration and metadata leakage.
    """
    if resource_owner_id != current_user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource_name} not found",
        )


def _find_folder_membership(db: Session, folder_id: int, current_user: User):
    """Look up a FolderMember row by user_id or email, lazily linking user_id if invited by email."""
    from sqlalchemy import func, or_
    from app.models import FolderMember

    member = (
        db.query(FolderMember)
        .filter(
            FolderMember.folder_id == folder_id,
            or_(
                FolderMember.user_id == current_user.id,
                func.lower(FolderMember.email) == current_user.email.lower(),
            ),
        )
        .first()
    )
    if member and member.user_id is None:
        member.user_id = current_user.id
        member.status = "active"
        db.commit()
    return member


def get_accessible_folder_ids(db: Session, current_user: User) -> list[int]:
    """Return all folder IDs owned by current_user or shared with them via FolderMember."""
    from sqlalchemy import func, or_, select
    from app.models import Folder, FolderMember

    owned_ids = db.scalars(select(Folder.id).where(Folder.owner_id == current_user.id)).all()
    shared_ids = db.scalars(
        select(FolderMember.folder_id).where(
            or_(
                FolderMember.user_id == current_user.id,
                func.lower(FolderMember.email) == current_user.email.lower(),
            )
        )
    ).all()
    return list({*owned_ids, *shared_ids})


def verify_folder_access(
    db: Session,
    folder: Any,
    current_user: User,
    require_editor: bool = False,
) -> None:
    """Allow folder owner or invited FolderMember; return 404 for non-members."""
    if folder.owner_id == current_user.id:
        return
    member = _find_folder_membership(db, folder.id, current_user)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    if require_editor and (member.role or "").lower() == "viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewer role cannot modify this workspace",
        )


def verify_decision_access(
    db: Session,
    decision: Any,
    current_user: User,
    require_editor: bool = False,
) -> None:
    """Allow decision owner or collaborator on the decision's parent folder."""
    if decision.owner_id == current_user.id:
        return
    if decision.folder_id:
        member = _find_folder_membership(db, decision.folder_id, current_user)
        if member:
            if require_editor and (member.role or "").lower() == "viewer":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Viewer role cannot modify this decision",
                )
            return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")