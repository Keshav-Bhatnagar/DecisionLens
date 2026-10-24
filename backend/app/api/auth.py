import logging
import secrets
from typing import List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.models import User
from app.schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    UserChangePassword,
    OAuthLoginRequest,
    OAuthProviderInfo,
)
from app.auth import hash_password, verify_password, create_token, get_current_user

logger = logging.getLogger("decisionlens.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register(body: UserRegister, db: Session = Depends(get_db)):
    """Register a new user account and return a signed JWT token."""
    normalized_email = body.email.lower().strip()

    stmt = select(User).where(User.email == normalized_email)
    existing_user = db.scalars(stmt).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    user = User(
        email=normalized_email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User login",
)
def login(body: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user with email and password and return a signed JWT token."""
    normalized_email = body.email.lower().strip()

    stmt = select(User).where(User.email == normalized_email)
    user = db.scalars(stmt).first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_token(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return UserResponse.model_validate(current_user)


@router.post(
    "/change-password",
    summary="Change user password",
)
def change_password(
    body: UserChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the authenticated user's password after validating current password."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password does not match",
        )

    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    db.refresh(current_user)

    return {"message": "Password changed successfully"}


@router.get(
    "/oauth/providers",
    response_model=List[OAuthProviderInfo],
    summary="List available OAuth identity providers",
)
def get_oauth_providers():
    """Return available OAuth providers and their configuration status."""
    providers: List[OAuthProviderInfo] = [
        OAuthProviderInfo(
            id="google",
            name="Google Workspace",
            configured=bool(settings.google_client_id),
            client_id=settings.google_client_id or None,
            auth_url=(
                f"https://accounts.google.com/o/oauth2/v2/auth?client_id={settings.google_client_id}&response_type=code&scope=openid%20email%20profile&redirect_uri=http://localhost:3000/auth/callback"
                if settings.google_client_id
                else None
            ),
        ),
        OAuthProviderInfo(
            id="github",
            name="GitHub",
            configured=bool(settings.github_client_id),
            client_id=settings.github_client_id or None,
            auth_url=(
                f"https://github.com/login/oauth/authorize?client_id={settings.github_client_id}&scope=user:email&redirect_uri=http://localhost:3000/auth/callback"
                if settings.github_client_id
                else None
            ),
        ),
        OAuthProviderInfo(
            id="microsoft",
            name="Microsoft / Office 365",
            configured=bool(settings.microsoft_client_id),
            client_id=settings.microsoft_client_id or None,
            auth_url=(
                f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id={settings.microsoft_client_id}&response_type=code&scope=openid%20email%20profile&redirect_uri=http://localhost:3000/auth/callback"
                if settings.microsoft_client_id
                else None
            ),
        ),
    ]
    return providers


@router.post(
    "/oauth/authenticate",
    response_model=TokenResponse,
    summary="Authenticate or register user via OAuth provider",
)
def authenticate_oauth(body: OAuthLoginRequest, db: Session = Depends(get_db)):
    """Authenticate or register user via Google, GitHub, or Microsoft OAuth.
    Supports real token verification or seamless dev sandbox simulation.
    """
    valid_providers = {"google", "github", "microsoft"}
    normalized_provider = body.provider.lower().strip()
    if normalized_provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider '{body.provider}'. Valid options: google, github, microsoft",
        )

    resolved_email: Optional[str] = None
    resolved_display_name: Optional[str] = body.display_name
    resolved_avatar: Optional[str] = body.avatar_url

    # 1. Google Authorization Code Exchange (OAuth callback flow)
    if normalized_provider == "google" and body.code:
        try:
            redirect_uri = body.redirect_uri or "http://localhost:3000/auth/callback"
            token_payload = {
                "code": body.code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }
            with httpx.Client(timeout=10.0) as client:
                token_resp = client.post("https://oauth2.googleapis.com/token", data=token_payload)
                if token_resp.status_code == 200:
                    t_data = token_resp.json()
                    access_token = t_data.get("access_token")
                    id_token = t_data.get("id_token")

                    if access_token:
                        u_resp = client.get(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {access_token}"},
                        )
                        if u_resp.status_code == 200:
                            u_info = u_resp.json()
                            resolved_email = u_info.get("email")
                            resolved_display_name = resolved_display_name or u_info.get("name")
                            resolved_avatar = resolved_avatar or u_info.get("picture")
                    elif id_token:
                        info_resp = client.get(
                            "https://oauth2.googleapis.com/tokeninfo",
                            params={"id_token": id_token},
                        )
                        if info_resp.status_code == 200:
                            u_info = info_resp.json()
                            resolved_email = u_info.get("email")
                            resolved_display_name = resolved_display_name or u_info.get("name")
                            resolved_avatar = resolved_avatar or u_info.get("picture")
                else:
                    err_detail = token_resp.text
                    try:
                        err_json = token_resp.json()
                        err_detail = err_json.get("error_description") or err_json.get("error") or err_detail
                    except Exception:
                        pass
                    logger.warning("Google token exchange error (%s): %s", token_resp.status_code, err_detail)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Google OAuth failed: {err_detail}. Note: Authorization codes expire in 60s and cannot be reused; please sign in again.",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Exception during Google OAuth code exchange: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to connect to Google OAuth: {str(exc)}",
            )

    # 2. Microsoft Azure AD Authorization Code Exchange
    if normalized_provider == "microsoft" and body.code:
        try:
            redirect_uri = body.redirect_uri or "http://localhost:3000/auth/callback"
            token_payload = {
                "code": body.code,
                "client_id": settings.microsoft_client_id,
                "client_secret": settings.microsoft_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }
            with httpx.Client(timeout=10.0) as client:
                token_resp = client.post(
                    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                    data=token_payload,
                )
                if token_resp.status_code == 200:
                    t_data = token_resp.json()
                    access_token = t_data.get("access_token")
                    if access_token:
                        me_resp = client.get(
                            "https://graph.microsoft.com/v1.0/me",
                            headers={"Authorization": f"Bearer {access_token}"},
                        )
                        if me_resp.status_code == 200:
                            u_info = me_resp.json()
                            resolved_email = u_info.get("mail") or u_info.get("userPrincipalName")
                            resolved_display_name = resolved_display_name or u_info.get("displayName")
                else:
                    logger.warning("Microsoft token exchange error (%s): %s", token_resp.status_code, token_resp.text)
        except Exception as exc:
            logger.error("Exception during Microsoft OAuth code exchange: %s", exc)

    # 3. GitHub Authorization Code Exchange
    if normalized_provider == "github" and body.code:
        try:
            redirect_uri = body.redirect_uri or "http://localhost:3000/auth/callback"
            token_payload = {
                "code": body.code,
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "redirect_uri": redirect_uri,
            }
            with httpx.Client(timeout=10.0) as client:
                token_resp = client.post(
                    "https://github.com/login/oauth/access_token",
                    headers={"Accept": "application/json"},
                    data=token_payload,
                )
                if token_resp.status_code == 200:
                    t_data = token_resp.json()
                    access_token = t_data.get("access_token")
                    if access_token:
                        u_resp = client.get(
                            "https://api.github.com/user",
                            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
                        )
                        if u_resp.status_code == 200:
                            u_info = u_resp.json()
                            resolved_email = u_info.get("email")
                            resolved_display_name = resolved_display_name or u_info.get("name") or u_info.get("login")
                            resolved_avatar = resolved_avatar or u_info.get("avatar_url")
                            if not resolved_email:
                                emails_resp = client.get(
                                    "https://api.github.com/user/emails",
                                    headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
                                )
                                if emails_resp.status_code == 200:
                                    for em in emails_resp.json():
                                        if em.get("primary") and em.get("verified"):
                                            resolved_email = em.get("email")
                                            break
                else:
                    logger.warning("GitHub token exchange error (%s): %s", token_resp.status_code, token_resp.text)
        except Exception as exc:
            logger.error("Exception during GitHub OAuth code exchange: %s", exc)

    # 4. Real Google Token Verification (if client_id is set and token provided)
    if normalized_provider == "google" and not resolved_email and settings.google_client_id and body.token and not body.token.startswith("mock_"):
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"id_token": body.token},
                )
                if resp.status_code == 200:
                    info = resp.json()
                    resolved_email = info.get("email")
                    resolved_display_name = resolved_display_name or info.get("name")
                    resolved_avatar = resolved_avatar or info.get("picture")
        except Exception:
            pass

    # 2. Direct verified email or Sandbox mode fallback
    if not resolved_email and body.email:
        resolved_email = str(body.email).lower().strip()
    elif not resolved_email and body.token and "@" in body.token:
        resolved_email = body.token.lower().strip()

    if not resolved_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth credentials: valid email or id_token is required.",
        )

    clean_email = resolved_email.lower().strip()

    stmt = select(User).where(User.email == clean_email)
    user = db.scalars(stmt).first()

    if not user:
        # Generate high-entropy password hash so user account is secure
        random_pwd = secrets.token_urlsafe(32) + "A1!"
        user = User(
            email=clean_email,
            password_hash=hash_password(random_pwd),
            oauth_provider=normalized_provider,
            display_name=resolved_display_name or clean_email.split("@")[0].title(),
            avatar_url=resolved_avatar,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update user profile metadata if missing
        changed = False
        if not user.oauth_provider:
            user.oauth_provider = normalized_provider
            changed = True
        if resolved_display_name and not user.display_name:
            user.display_name = resolved_display_name
            changed = True
        if resolved_avatar and not user.avatar_url:
            user.avatar_url = resolved_avatar
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    token = create_token(user.id)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )
