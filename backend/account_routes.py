"""Google / Apple sign-in, username changes and account deletion."""
import logging
import re
import secrets
from typing import Literal, Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

import oauth
from auth import clear_session, get_current_user, issue_session, public_user
from db import get_pool
from moderation import ValidationError, validate_password, validate_username
from ratelimit import limiter
from security import hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# Stored instead of a bcrypt hash for accounts that only sign in with Google or
# Apple. bcrypt.checkpw rejects it as malformed, so password login can never match.
NO_PASSWORD = "!oauth-only"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GoogleSignIn(StrictModel):
    id_token: str = Field(min_length=20, max_length=4096)
    nonce: Optional[str] = Field(default=None, max_length=256)


class AppleSignIn(StrictModel):
    identity_token: str = Field(min_length=20, max_length=4096)
    authorization_code: Optional[str] = Field(default=None, max_length=512)
    nonce: Optional[str] = Field(default=None, max_length=256)
    # Apple only reveals the name once, on the very first sign-in, and only to the app.
    given_name: Optional[str] = Field(default=None, max_length=60)
    family_name: Optional[str] = Field(default=None, max_length=60)


class UsernameChange(StrictModel):
    username: str = Field(max_length=50)


class PasswordChange(StrictModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class DeleteAccount(StrictModel):
    confirm: Literal["DELETE"]


def has_password(user) -> bool:
    return bool(user["password_hash"]) and not user["password_hash"].startswith("!")


# --- usernames for new external accounts ---------------------------------------

def _username_seed(identity: oauth.Identity, name_hint: Optional[str]) -> str:
    raw = name_hint or identity.name or (identity.email or "").split("@")[0]
    seed = re.sub(r"[^a-z0-9_]", "", raw.lower().replace(" ", "_"))[:14]
    return seed if len(seed) >= 3 else "player"


async def _available_username(conn, seed: str) -> str:
    """A handle that passes moderation and isn't taken. Players can change it later."""
    candidates = [seed] + [f"{seed}_{secrets.randbelow(10_000):04d}" for _ in range(8)]
    for candidate in candidates:
        try:
            name = validate_username(candidate)
        except ValidationError:
            continue
        if not await conn.fetchval("SELECT 1 FROM users WHERE username = $1", name):
            return name
    return f"player_{secrets.token_hex(4)}"


# --- sign in --------------------------------------------------------------------

async def _sign_in(response: Response, identity: oauth.Identity, name_hint: Optional[str] = None,
                   apple_refresh_token: Optional[str] = None):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            link = await conn.fetchrow(
                "SELECT * FROM user_identities WHERE provider = $1 AND subject = $2 FOR UPDATE",
                identity.provider, identity.subject,
            )
            created = False
            if link:
                user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", link["user_id"])
                await conn.execute(
                    """UPDATE user_identities SET last_login_at = now(),
                       apple_refresh_token = COALESCE($3, apple_refresh_token)
                       WHERE provider = $1 AND subject = $2""",
                    identity.provider, identity.subject, apple_refresh_token,
                )
            else:
                if identity.email:
                    existing = await conn.fetchrow("SELECT id FROM users WHERE lower(email) = $1", identity.email)
                    if existing:
                        # Never auto-merge into an existing account: we don't verify emails on
                        # password sign-up, so someone could pre-register your address and
                        # wait for you to sign in with Google (account pre-hijacking).
                        raise HTTPException(
                            status_code=409,
                            detail="That email already has a CipherRush account. Log in with your password instead.",
                        )
                email = identity.email or f"{identity.provider}-{identity.subject}@users.cipherrush.invalid"
                username = await _available_username(conn, _username_seed(identity, name_hint))
                try:
                    user = await conn.fetchrow(
                        # Google and Apple have already verified the address (or there is none).
                        """INSERT INTO users (username, password_hash, email, is_verified)
                           VALUES ($1, $2, $3, true) RETURNING *""",
                        username, NO_PASSWORD, email,
                    )
                except asyncpg.UniqueViolationError:
                    raise HTTPException(status_code=409, detail="Couldn't create that account. Try again.")
                await conn.execute(
                    """INSERT INTO user_identities (provider, subject, user_id, email, client_id, apple_refresh_token)
                       VALUES ($1, $2, $3, $4, $5, $6)""",
                    identity.provider, identity.subject, user["id"], identity.email, identity.audience,
                    apple_refresh_token,
                )
                created = True
            await conn.execute("UPDATE users SET last_active = now() WHERE id = $1", user["id"])
            await issue_session(conn, response, user["id"], user["session_version"])
    return {"user": public_user(user), "created": created}


def _oauth_errors(provider: str):
    def handle(exc: Exception):
        if isinstance(exc, oauth.OAuthNotConfigured):
            return HTTPException(status_code=503, detail=f"{provider} sign-in isn't switched on yet.")
        logger.info("Rejected %s token: %s", provider, exc)
        return HTTPException(status_code=401, detail=f"{provider} sign-in didn't check out. Try again.")
    return handle


@router.get("/auth/providers")
async def auth_providers():
    """Which sign-in buttons the app should show. No secrets here."""
    return {"google": bool(oauth.google_client_ids()), "apple": bool(oauth.apple_client_ids())}


@router.post("/auth/google")
@limiter.limit("10/minute")
async def sign_in_with_google(request: Request, response: Response, body: GoogleSignIn):
    try:
        identity = await oauth.verify_google(body.id_token, body.nonce)
    except (oauth.OAuthNotConfigured, oauth.OAuthInvalidToken) as exc:
        raise _oauth_errors("Google")(exc)
    if identity.email and not identity.email_verified:
        raise HTTPException(status_code=401, detail="Verify your Google email first, then try again.")
    return await _sign_in(response, identity)


@router.post("/auth/apple")
@limiter.limit("10/minute")
async def sign_in_with_apple(request: Request, response: Response, body: AppleSignIn):
    try:
        identity = await oauth.verify_apple(body.identity_token, body.nonce)
    except (oauth.OAuthNotConfigured, oauth.OAuthInvalidToken) as exc:
        raise _oauth_errors("Apple")(exc)
    refresh_token = None
    if body.authorization_code:
        # Kept only so we can revoke it if the player deletes their account.
        refresh_token = await oauth.apple_exchange_code(body.authorization_code, identity.audience)
    name_hint = " ".join(p for p in (body.given_name, body.family_name) if p) or None
    return await _sign_in(response, identity, name_hint=name_hint, apple_refresh_token=refresh_token)


# --- account management ------------------------------------------------------------

@router.post("/me/username")
@limiter.limit("10/minute")
async def change_username(request: Request, body: UsernameChange, user=Depends(get_current_user)):
    try:
        username = validate_username(body.username)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            updated = await conn.fetchrow(
                "UPDATE users SET username = $1 WHERE id = $2 RETURNING *", username, user["id"]
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail="That handle's taken. Try another.")
    return {"user": public_user(updated)}


@router.post("/me/password")
@limiter.limit("5/minute")
async def change_password(request: Request, response: Response, body: PasswordChange,
                          user=Depends(get_current_user)):
    """Change the password, given the current one. Every other device is signed
    out (session_version bump); this one gets a fresh session."""
    if not has_password(user):
        raise HTTPException(status_code=400, detail="This account signs in with Google or Apple, so it has no password to change.")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="That's not your current password.")
    if body.new_password == body.current_password:
        raise HTTPException(status_code=400, detail="Pick a password you haven't been using.")
    try:
        validate_password(body.new_password)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            updated = await conn.fetchrow(
                """UPDATE users SET password_hash = $2, session_version = session_version + 1
                   WHERE id = $1 RETURNING id, session_version""",
                user["id"], hash_password(body.new_password),
            )
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user["id"])
            await issue_session(conn, response, updated["id"], updated["session_version"])
    logger.info("Password changed: %s", user["id"])
    return {"changed": True}


@router.get("/me/account")
async def account_details(user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        providers = [r["provider"] for r in await conn.fetch(
            "SELECT provider FROM user_identities WHERE user_id = $1 ORDER BY provider", user["id"]
        )]
    email = user["email"]
    return {
        "username": user["username"],
        "email": None if email.endswith("@users.cipherrush.invalid") else email,
        "has_password": has_password(user),
        "is_verified": user["is_verified"],
        "providers": providers,
    }


@router.post("/me/delete")
@limiter.limit("5/minute")
async def delete_account(request: Request, response: Response, body: DeleteAccount, user=Depends(get_current_user)):
    """Permanently delete the account and everything tied to it (all child rows
    cascade). Apple tokens are revoked first, as App Store rules require."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        apple_links = await conn.fetch(
            "SELECT apple_refresh_token, client_id FROM user_identities "
            "WHERE user_id = $1 AND provider = 'apple' AND apple_refresh_token IS NOT NULL",
            user["id"],
        )
        for link in apple_links:
            await oauth.apple_revoke(link["apple_refresh_token"], link["client_id"])
        await conn.execute("DELETE FROM users WHERE id = $1", user["id"])
    clear_session(response)
    logger.info("Account deleted: %s", user["id"])
    return {"deleted": True}
