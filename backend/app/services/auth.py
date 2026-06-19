"""Supabase JWT authentication.

The frontend sends the user's Supabase access token as `Authorization: Bearer
<jwt>`. We verify it locally with the project's JWT secret (HS256) and derive the
acting user from the verified `sub` claim — never from a client-supplied user_id.
The service-role key stays server-side and is never exposed.
"""

from typing import Annotated

import jwt
from fastapi import Header, HTTPException

from app.config import settings


def verify_supabase_jwt(token: str) -> str:
    """Verify a Supabase access token and return its user id (`sub`).

    Raises HTTPException(401) for missing/expired/invalid tokens, and 503 if the
    server has no JWT secret configured (so auth can never silently no-op).
    """
    secret = settings.supabase_jwt_secret
    if not secret:
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Your session has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid or tampered session") from exc

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Invalid session")
    return sub


def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """FastAPI dependency: the verified acting user's id from the Bearer token."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to continue")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return verify_supabase_jwt(token)
