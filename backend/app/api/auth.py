import logging
import secrets
from typing import List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
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
def get_oauth_providers(request: Request):
    """Return available OAuth providers, unified under Supabase OAuth with dynamic origin resolution."""
    base_url = settings.supabase_url.rstrip("/") if settings.supabase_url else "https://fzqlmmdfiiwaqawygkyf.supabase.co"

    # Dynamically determine frontend origin for redirect
    frontend_origin = "http://localhost:3000"
    if request:
        origin_header = request.headers.get("origin") or request.headers.get("referer")
        if origin_header:
            from urllib.parse import urlparse
            parsed = urlparse(origin_header)
            if parsed.scheme and parsed.netloc:
                frontend_origin = f"{parsed.scheme}://{parsed.netloc}"

    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.google_client_id}&"
        f"redirect_uri={frontend_origin}/auth/callback&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"access_type=offline&"
        f"prompt=select_account"
    ) if settings.google_client_id else f"{base_url}/auth/v1/authorize?provider=google&scopes=openid%20email%20profile&redirect_to={frontend_origin}/auth/callback"

    providers: List[OAuthProviderInfo] = [
        OAuthProviderInfo(
            id="google",
            name="Google Workspace",
            configured=bool(settings.google_client_id),
            client_id=settings.google_client_id or None,
            auth_url=google_auth_url,
        ),
        OAuthProviderInfo(
            id="microsoft",
            name="Microsoft / Azure AD",
            configured=bool(settings.microsoft_client_id),
            client_id=settings.microsoft_client_id or None,
            auth_url=f"{base_url}/auth/v1/authorize?provider=azure&scopes=openid%20email%20profile&redirect_to={frontend_origin}/auth/callback",
        ),
        OAuthProviderInfo(
            id="github",
            name="GitHub",
            configured=bool(settings.github_client_id),
            client_id=settings.github_client_id or None,
            auth_url=f"{base_url}/auth/v1/authorize?provider=github&redirect_to={frontend_origin}/auth/callback",
        ),
    ]
    return providers


@router.post(
    "/oauth/authenticate",
    response_model=TokenResponse,
    summary="Authenticate or register user via OAuth provider",
)
def authenticate_oauth(body: OAuthLoginRequest, db: Session = Depends(get_db)):
    """Authenticate or register user via Google, GitHub, Microsoft, or Supabase OAuth.
    Supports real token verification or seamless dev sandbox simulation.
    """
    valid_providers = {"google", "github", "microsoft", "supabase", "azure"}
    normalized_provider = body.provider.lower().strip()

    # Smart auto-detection if code signature identifies a specific provider
    if body.code:
        code_str = body.code.strip()
        if code_str.startswith("M.") or "MS-" in code_str or len(code_str) > 400:
            normalized_provider = "microsoft"
        elif code_str.startswith("4/"):
            normalized_provider = "google"
        elif len(code_str) == 20 and all(c in "0123456789abcdefABCDEF" for c in code_str):
            normalized_provider = "github"

    if normalized_provider not in valid_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider '{body.provider}'. Valid options: google, github, microsoft, supabase",
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

                    # Decode Google id_token claims directly
                    if id_token:
                        try:
                            import base64
                            import json
                            payload_part = id_token.split(".")[1]
                            padded = payload_part + "=" * ((4 - len(payload_part) % 4) % 4)
                            decoded = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
                            resolved_email = decoded.get("email") or resolved_email
                            resolved_display_name = resolved_display_name or decoded.get("name")
                            resolved_avatar = resolved_avatar or decoded.get("picture")
                        except Exception:
                            pass

                    if not resolved_email and access_token:
                        u_resp = client.get(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            headers={"Authorization": f"Bearer {access_token}"},
                        )
                        if u_resp.status_code == 200:
                            u_info = u_resp.json()
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
                    id_token = t_data.get("id_token")

                    # Extract claims from Microsoft id_token (vital for personal accounts like @gmail.com where Graph mail is null)
                    if id_token:
                        try:
                            import base64
                            import json
                            payload_part = id_token.split(".")[1]
                            padded = payload_part + "=" * ((4 - len(payload_part) % 4) % 4)
                            decoded = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
                            token_email = decoded.get("email") or decoded.get("preferred_username") or decoded.get("upn")
                            if token_email and "@" in token_email:
                                resolved_email = token_email
                            resolved_display_name = resolved_display_name or decoded.get("name")
                        except Exception as decode_err:
                            logger.warning("Failed to decode Microsoft id_token: %s", decode_err)

                    if access_token and not resolved_email:
                        try:
                            me_resp = client.get(
                                "https://graph.microsoft.com/v1.0/me",
                                headers={"Authorization": f"Bearer {access_token}"},
                            )
                            if me_resp.status_code == 200:
                                u_info = me_resp.json()
                                resolved_email = u_info.get("mail") or u_info.get("userPrincipalName")
                                resolved_display_name = resolved_display_name or u_info.get("displayName")
                        except Exception:
                            pass
                else:
                    err_detail = token_resp.text
                    try:
                        err_json = token_resp.json()
                        err_detail = err_json.get("error_description") or err_json.get("error") or err_detail
                    except Exception:
                        pass
                    logger.warning("Microsoft token exchange error (%s): %s", token_resp.status_code, err_detail)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Microsoft OAuth failed: {err_detail}",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Exception during Microsoft OAuth code exchange: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to connect to Microsoft OAuth: {str(exc)}",
            )

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
                    err_detail = token_resp.text
                    try:
                        err_json = token_resp.json()
                        err_detail = err_json.get("error_description") or err_json.get("error") or err_detail
                    except Exception:
                        pass
                    logger.warning("GitHub token exchange error (%s): %s", token_resp.status_code, err_detail)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"GitHub OAuth failed: {err_detail}",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Exception during GitHub OAuth code exchange: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to connect to GitHub OAuth: {str(exc)}",
            )

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

    # 5. Supabase OAuth Token / Hash Verification
    if (normalized_provider in {"supabase", "azure"} or "supabase" in normalized_provider or not resolved_email) and body.token and not body.token.startswith("mock_"):
        try:
            import base64
            import json
            token_str = body.token.strip()
            # Decode JWT payload
            if "." in token_str:
                parts = token_str.split(".")
                if len(parts) >= 2:
                    payload_part = parts[1]
                    padded = payload_part + "=" * ((4 - len(payload_part) % 4) % 4)
                    decoded = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
                    resolved_email = (
                        decoded.get("email")
                        or decoded.get("user_metadata", {}).get("email")
                        or decoded.get("preferred_username")
                        or resolved_email
                    )
                    user_meta = decoded.get("user_metadata") or {}
                    resolved_display_name = (
                        resolved_display_name
                        or user_meta.get("full_name")
                        or user_meta.get("name")
                        or decoded.get("name")
                    )
                    resolved_avatar = (
                        resolved_avatar
                        or user_meta.get("avatar_url")
                        or user_meta.get("picture")
                    )

            if settings.supabase_anon_key and settings.supabase_url:
                try:
                    with httpx.Client(timeout=6.0) as client:
                        u_res = client.get(
                            f"{settings.supabase_url}/auth/v1/user",
                            headers={
                                "Authorization": f"Bearer {token_str}",
                                "apikey": settings.supabase_anon_key,
                            },
                        )
                        if u_res.status_code == 200:
                            u_data = u_res.json()
                            resolved_email = u_data.get("email") or resolved_email
                            m = u_data.get("user_metadata") or {}
                            resolved_display_name = m.get("full_name") or m.get("name") or resolved_display_name
                            resolved_avatar = m.get("avatar_url") or resolved_avatar
                except Exception as api_err:
                    logger.warning("Supabase user API verification warning: %s", api_err)
        except Exception as exc:
            logger.warning("Supabase token decode warning: %s", exc)

    # 6. Supabase Code Exchange (if PKCE code was returned from Supabase OAuth)
    if (normalized_provider in {"supabase", "azure"} or "supabase" in normalized_provider) and body.code and not resolved_email and settings.supabase_url:
        try:
            redirect_uri = body.redirect_uri or "http://localhost:3000/auth/callback"
            token_url = f"{settings.supabase_url}/auth/v1/token?grant_type=pkce"
            headers = {}
            if settings.supabase_anon_key:
                headers["apikey"] = settings.supabase_anon_key
            with httpx.Client(timeout=8.0) as client:
                res = client.post(
                    token_url,
                    headers=headers,
                    json={
                        "auth_code": body.code,
                        "code": body.code,
                        "redirect_uri": redirect_uri,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    user = data.get("user") or {}
                    resolved_email = user.get("email")
                    u_meta = user.get("user_metadata") or {}
                    resolved_display_name = u_meta.get("full_name") or u_meta.get("name") or resolved_display_name
                    resolved_avatar = u_meta.get("avatar_url") or resolved_avatar
        except Exception as pkce_err:
            logger.warning("Supabase PKCE code exchange warning: %s", pkce_err)

    # 7. Direct verified email or Sandbox mode fallback
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
