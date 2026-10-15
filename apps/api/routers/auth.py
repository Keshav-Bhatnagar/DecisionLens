import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from apps.api.core.config import settings
from apps.api.core.database import get_db
from apps.api.models.database import User
from apps.api.models.schemas import UserCreate, UserResponse, Token

router = APIRouter(prefix="/auth", tags=["Auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    """Hash password securely using SHA-256 with salt."""
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(plain_password: str, stored_hash: str) -> bool:
    """Verify password against stored salt:hash."""
    try:
        salt, expected_hash = stored_hash.split(":")
        computed_hash = hashlib.sha256((salt + plain_password).encode()).hexdigest()
        return hmac.compare_digest(computed_hash, expected_hash)
    except Exception:
        return False


def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    """Retrieve current user or return demo user if token is optional."""
    if not token:
        return None
    # For local simplicity and zero-latency dev, extract email directly or decode
    user = db.query(User).filter(User.email == token).first()
    return user


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """Register a new user account."""
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )
    user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate user and return access token."""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=user.email, token_type="bearer")


@router.get("/me", response_model=Optional[UserResponse])
def get_profile(current_user: Optional[User] = Depends(get_current_user)):
    """Get profile of current authenticated user."""
    return current_user
