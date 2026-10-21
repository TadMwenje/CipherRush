"""Google and Apple sign-in: server-side ID token verification.

The app (native or web) signs the player in with Google or Apple and sends us
the resulting ID token. We never trust what's inside until we've checked it:

  * Google: verified with Google's official `google-auth` library - signature
    against Google's published certs, issuer, expiry, and audience. The
    audience must be one of OUR OAuth client IDs (GOOGLE_CLIENT_IDS), so a
    token minted for some other app can't be replayed here.
  * Apple: verified with PyJWT against Apple's published JWKS - RS256
    signature, issuer https://appleid.apple.com, expiry, and audience in
    APPLE_CLIENT_IDS (the iOS bundle id and/or the web Services ID).

Neither check needs a client secret. The only secret involved is Apple's .p8
key (APPLE_PRIVATE_KEY), used server-side to exchange an authorization code
for a refresh token and to revoke it when a player deletes their account
(App Store requirement). It never leaves the server.
"""
import hashlib
import logging
import os
import time
from dataclasses import dataclass
from typing import List, Optional

import httpx
import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
CLOCK_SKEW_SECONDS = 10


class OAuthNotConfigured(Exception):
    """The provider has no client IDs configured on this server."""


class OAuthInvalidToken(Exception):
    """The token failed verification. The message is safe to log, not to show."""


@dataclass
class Identity:
    provider: str
    subject: str
    email: Optional[str]
    email_verified: bool
    name: Optional[str]
    audience: str


def _csv_env(name: str) -> List[str]:
    return [v.strip() for v in os.environ.get(name, "").split(",") if v.strip()]


def google_client_ids() -> List[str]:
    return _csv_env("GOOGLE_CLIENT_IDS")


def apple_client_ids() -> List[str]:
    return _csv_env("APPLE_CLIENT_IDS")


def _nonce_matches(claim: Optional[str], nonce: Optional[str]) -> bool:
    """Apple (and some Google flows) carry SHA-256(raw nonce); others carry it raw."""
    if nonce is None:
        return True
    if not claim:
        return False
    return claim in (nonce, hashlib.sha256(nonce.encode()).hexdigest())


# --- Google -------------------------------------------------------------------

_google_request = google_requests.Request()


def _verify_google_sync(token: str, audiences: List[str]) -> dict:
    return google_id_token.verify_oauth2_token(
        token, _google_request, audience=audiences, clock_skew_in_seconds=CLOCK_SKEW_SECONDS
    )


async def verify_google(token: str, nonce: Optional[str] = None) -> Identity:
    audiences = google_client_ids()
    if not audiences:
        raise OAuthNotConfigured("google")
    try:
        claims = await run_in_threadpool(_verify_google_sync, token, audiences)
    except Exception as exc:  # google-auth raises ValueError / GoogleAuthError subclasses
        raise OAuthInvalidToken(f"google: {exc}") from exc
    if not _nonce_matches(claims.get("nonce"), nonce):
        raise OAuthInvalidToken("google: nonce mismatch")
    return Identity(
        provider="google",
        subject=str(claims["sub"]),
        email=(claims.get("email") or "").lower() or None,
        email_verified=claims.get("email_verified") is True,
        name=claims.get("name") or claims.get("given_name"),
        audience=claims["aud"],
    )


# --- Apple --------------------------------------------------------------------

_apple_jwks_client = jwt.PyJWKClient(APPLE_JWKS_URL, cache_keys=True, lifespan=3600)


def apple_signing_key(token: str):
    """Public key Apple signed this token with (cached JWKS). Patched in tests."""
    return _apple_jwks_client.get_signing_key_from_jwt(token).key


def _verify_apple_sync(token: str, audiences: List[str]) -> dict:
    key = apple_signing_key(token)
    return jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience=audiences,
        issuer=APPLE_ISSUER,
        leeway=CLOCK_SKEW_SECONDS,
        options={"require": ["sub", "iss", "aud", "exp", "iat"]},
    )


async def verify_apple(token: str, nonce: Optional[str] = None) -> Identity:
    audiences = apple_client_ids()
    if not audiences:
        raise OAuthNotConfigured("apple")
    try:
        claims = await run_in_threadpool(_verify_apple_sync, token, audiences)
    except Exception as exc:
        raise OAuthInvalidToken(f"apple: {exc}") from exc
    if not _nonce_matches(claims.get("nonce"), nonce):
        raise OAuthInvalidToken("apple: nonce mismatch")
    verified = claims.get("email_verified")
    return Identity(
        provider="apple",
        subject=str(claims["sub"]),
        email=(claims.get("email") or "").lower() or None,
        email_verified=verified is True or verified == "true",
        name=None,  # Apple never puts the name in the token; the app sends it once, on first sign-in
        audience=claims["aud"] if isinstance(claims["aud"], str) else claims["aud"][0],
    )


# --- Apple server-to-server (code exchange + revoke) ---------------------------

def apple_server_api_configured() -> bool:
    return all(os.environ.get(k) for k in ("APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"))


def _apple_client_secret(client_id: str) -> str:
    """Short-lived ES256 JWT signed with our .p8 key - Apple's 'client secret'."""
    now = int(time.time())
    private_key = os.environ["APPLE_PRIVATE_KEY"].replace("\\n", "\n")
    return jwt.encode(
        {"iss": os.environ["APPLE_TEAM_ID"], "iat": now, "exp": now + 300, "aud": APPLE_ISSUER, "sub": client_id},
        private_key,
        algorithm="ES256",
        headers={"kid": os.environ["APPLE_KEY_ID"]},
    )


async def apple_exchange_code(code: str, client_id: str) -> Optional[str]:
    """Trade a one-time authorization code for a refresh token (kept so we can revoke it later)."""
    if not apple_server_api_configured():
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(APPLE_TOKEN_URL, data={
                "client_id": client_id,
                "client_secret": _apple_client_secret(client_id),
                "code": code,
                "grant_type": "authorization_code",
            })
        if res.status_code != 200:
            logger.warning("Apple code exchange failed: %s %s", res.status_code, res.text[:200])
            return None
        return res.json().get("refresh_token")
    except Exception:
        logger.exception("Apple code exchange error")
        return None


async def apple_revoke(refresh_token: str, client_id: str) -> bool:
    if not apple_server_api_configured() or not refresh_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(APPLE_REVOKE_URL, data={
                "client_id": client_id,
                "client_secret": _apple_client_secret(client_id),
                "token": refresh_token,
                "token_type_hint": "refresh_token",
            })
        if res.status_code != 200:
            logger.warning("Apple revoke failed: %s %s", res.status_code, res.text[:200])
        return res.status_code == 200
    except Exception:
        logger.exception("Apple revoke error")
        return False
