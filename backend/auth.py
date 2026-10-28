"""Session authentication for a mobile-first client.

Two httpOnly cookies:
  * cr_session - short-lived access token (15 min), sent to every /api route.
  * cr_refresh - long-lived refresh token (30 days), sent only to /api/auth.

Phones sleep, switch networks and get backgrounded for hours, so the client
silently calls /api/auth/refresh when an access token lapses. Refresh tokens
rotate on every use; replaying a used one revokes every session for the
account (bumps users.session_version), except within a short grace window
that covers a phone firing two refreshes at once after waking up.

The browser never sends a user id of its own - every protected endpoint
derives the acting user from the verified access token via get_current_user.
"""
import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from db import get_pool

logger = logging.getLogger(__name__)

SESSION_COOKIE = "cr_session"
REFRESH_COOKIE = "cr_refresh"
JWT_ALGORITHM = "HS256"
ACCESS_TTL_SECONDS = 15 * 60
REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
REFRESH_REUSE_GRACE_SECONDS = 30
CSRF_HEADER = "X-Requested-With"
CSRF_HEADER_VALUE = "CipherRush"

_SECRET = None


def _secret() -> str:
    global _SECRET
    if _SECRET is None:
        secret = os.environ.get("JWT_SECRET", "")
        if len(secret) < 32:
            logger.warning("JWT_SECRET missing or shorter than 32 chars - using an ephemeral secret")
            secret = secrets.token_urlsafe(48)
        _SECRET = secret
    return _SECRET


def _cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "false").lower() == "true"


def _cookie_samesite() -> str:
    # "none" is needed if a native wrapper calls the API cross-site; it requires Secure.
    value = os.environ.get("COOKIE_SAMESITE", "lax").lower()
    return value if value in ("lax", "strict", "none") else "lax"


def _encode(claims: Dict[str, Any]) -> str:
    return jwt.encode(claims, _secret(), algorithm=JWT_ALGORITHM)


def _set_cookie(response: Response, name: str, value: str, max_age: int, path: str) -> None:
    response.set_cookie(name, value, max_age=max_age, httponly=True, secure=_cookie_secure(),
                        samesite=_cookie_samesite(), path=path)


async def issue_session(conn, response: Response, user_id: uuid.UUID, session_version: int) -> None:
    """Mint a fresh access + refresh pair (call inside the request's DB connection)."""
    now = int(time.time())
    _set_cookie(response, SESSION_COOKIE, _encode({
        "sub": str(user_id), "ver": session_version, "typ": "access",
        "iat": now, "exp": now + ACCESS_TTL_SECONDS,
    }), ACCESS_TTL_SECONDS, "/api")

    jti = secrets.token_urlsafe(24)
    await conn.execute(
        "INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))",
        jti, user_id, float(REFRESH_TTL_SECONDS),
    )
    _set_cookie(response, REFRESH_COOKIE, _encode({
        "sub": str(user_id), "ver": session_version, "typ": "refresh", "jti": jti,
        "iat": now, "exp": now + REFRESH_TTL_SECONDS,
    }), REFRESH_TTL_SECONDS, "/api/auth")


def clear_session(response: Response) -> None:
    for name, path in ((SESSION_COOKIE, "/api"), (REFRESH_COOKIE, "/api/auth")):
        response.delete_cookie(name, path=path, httponly=True, samesite=_cookie_samesite(), secure=_cookie_secure())


def _decode(token: str, expected_type: str) -> Dict[str, Any]:
    try:
        claims = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM],
                            options={"require": ["sub", "exp", "iat", "ver", "typ"]})
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid session")
    if claims.get("typ") != expected_type:
        raise HTTPException(status_code=401, detail="Invalid session")
    try:
        claims["user_id"] = uuid.UUID(claims["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid session")
    return claims


async def get_current_user(request: Request):
    """FastAPI dependency: the verified user row for this request, or 401."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    claims = _decode(token, "access")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", claims["user_id"])
    if not user or user["session_version"] != claims["ver"]:
        raise HTTPException(status_code=401, detail="Session revoked")
    return user


async def refresh_session(request: Request, response: Response):
    """Rotate the refresh token and mint a new access token. Returns the user row."""
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    claims = _decode(token, "refresh")
    jti = claims.get("jti")
    pool = await get_pool()
    reused = False
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow("SELECT * FROM refresh_tokens WHERE jti = $1 FOR UPDATE", jti)
            user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", claims["user_id"])
            if not row or not user or row["user_id"] != user["id"] or user["session_version"] != claims["ver"]:
                raise HTTPException(status_code=401, detail="Session revoked")
            grace = datetime.now(timezone.utc) - timedelta(seconds=REFRESH_REUSE_GRACE_SECONDS)
            if row["used_at"] is not None and row["used_at"] < grace:
                # A long-retired token came back: assume theft and kill every session.
                # Committed here, *before* the 401 - raising inside the transaction would roll it back.
                await conn.execute("UPDATE users SET session_version = session_version + 1 WHERE id = $1", user["id"])
                await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user["id"])
                reused = True
            else:
                if row["used_at"] is None:
                    await conn.execute("UPDATE refresh_tokens SET used_at = now() WHERE jti = $1", jti)
                await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < now()", user["id"])
                await issue_session(conn, response, user["id"], user["session_version"])
    if reused:
        logger.warning("Refresh token reuse for user %s - all sessions revoked", claims["user_id"])
        raise HTTPException(status_code=401, detail="Session revoked")
    return user


class CSRFHeaderMiddleware(BaseHTTPMiddleware):
    """Require a custom header on state-changing API requests.

    Browsers can't attach custom headers cross-site without a CORS preflight,
    which our CORS policy only grants to known origins - so this blocks
    cross-site form/beacon submissions riding on the session cookie.
    """

    async def dispatch(self, request, call_next):
        if (
            request.method in ("POST", "PUT", "PATCH", "DELETE")
            and request.url.path.startswith("/api/")
            and request.headers.get(CSRF_HEADER) != CSRF_HEADER_VALUE
        ):
            return JSONResponse(status_code=403, content={"detail": "Missing CSRF header"})
        return await call_next(request)


def public_user(user) -> dict:
    """The user fields safe to send to the signed-in player."""
    return {
        "id": str(user["id"]),
        "username": user["username"],
        "level": user["level"],
        "total_score": user["total_score"],
        "puzzles_completed": user["puzzles_completed"],
        "badges": user["badges"],
        "is_verified": user["is_verified"],
    }
