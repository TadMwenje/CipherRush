"""Email verification and password resets for handle / password accounts.

  * Sign-up sends a 6-digit code (typed in the app) and a link (the email's
    button). Either one verifies the address; unverified players can play but
    stay off the leaderboards.
  * Forgot password takes a handle or an email, always answers the same way
    (no account enumeration), and emails a single-use 15-minute link.

Only hashes of codes and tokens are stored. The reset and verify links carry
their token after "#", which browsers never send to the server, so it can't
end up in Render or Cloudflare request logs; the page posts it back itself.
"""
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field

import mailer
from account_routes import has_password
from auth import _secret, clear_session, get_current_user, public_user
from db import get_pool
from mail_templates import password_reset_email, verification_email
from moderation import ValidationError, normalize_email, normalize_username, validate_password
from ratelimit import limiter
from security import hash_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

CODE_TTL_MINUTES = 30
RESET_TTL_MINUTES = 15
MAX_CODE_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60
MAX_CODES_PER_HOUR = 5
RESET_COOLDOWN_SECONDS = 60
GENERIC_RESET_REPLY = "If an account exists for that handle/email, a reset link has been sent."
PLACEHOLDER_EMAIL_DOMAIN = "@users.cipherrush.invalid"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VerifyCode(StrictModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class LinkToken(StrictModel):
    token: str = Field(min_length=20, max_length=128)


class ForgotPassword(StrictModel):
    identifier: str = Field(min_length=3, max_length=255)


class ResetPassword(StrictModel):
    token: str = Field(min_length=20, max_length=128)
    new_password: str = Field(max_length=128)


def public_base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "https://api.aximoix.com").rstrip("/")


def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _code_hash(user_id, code: str) -> str:
    # Keyed, so a database leak alone can't be brute-forced back to live codes.
    return hmac.new(_secret().encode("utf-8"), f"{user_id}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def can_receive_mail(user) -> bool:
    return not user["email"].endswith(PLACEHOLDER_EMAIL_DOMAIN) and not user["is_review_account"]


# --- verification -------------------------------------------------------------

async def new_verification(conn, user) -> mailer.Email:
    """Replace the account's code with a fresh one; returns the email to send."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    link_token = secrets.token_urlsafe(32)
    await conn.execute("DELETE FROM email_otps WHERE user_id = $1", user["id"])
    await conn.execute(
        """INSERT INTO email_otps (user_id, code_hash, link_hash, expires_at)
           VALUES ($1, $2, $3, now() + make_interval(mins => $4))""",
        user["id"], _code_hash(user["id"], code), _sha256(link_token), CODE_TTL_MINUTES,
    )
    link = f"{public_base_url()}/api/auth/verify-email#{link_token}"
    return verification_email(user["email"], user["username"], code, link, CODE_TTL_MINUTES)


async def _mark_verified(conn, user_id):
    await conn.execute("UPDATE users SET is_verified = true WHERE id = $1", user_id)
    await conn.execute("DELETE FROM email_otps WHERE user_id = $1", user_id)
    return await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)


@router.post("/me/verify-email")
@limiter.limit("10/minute")
async def verify_with_code(request: Request, body: VerifyCode, user=Depends(get_current_user)):
    if user["is_verified"]:
        return {"verified": True, "user": public_user(user)}
    pool = await get_pool()
    problem: Optional[str] = None
    async with pool.acquire() as conn:
        async with conn.transaction():
            otp = await conn.fetchrow(
                "SELECT * FROM email_otps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
                user["id"],
            )
            if not otp or otp["expires_at"] < datetime.now(timezone.utc):
                problem = "That code has expired. Send a new one."
            elif otp["attempts"] >= MAX_CODE_ATTEMPTS:
                problem = "Too many wrong tries. Send a new code."
            elif not hmac.compare_digest(otp["code_hash"], _code_hash(user["id"], body.code)):
                # Counted here and committed before the 400 below, so guesses can't be retried for free.
                await conn.execute("UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1", otp["id"])
                left = MAX_CODE_ATTEMPTS - otp["attempts"] - 1
                problem = f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left." if left else \
                    "Too many wrong tries. Send a new code."
            else:
                user = await _mark_verified(conn, user["id"])
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    return {"verified": True, "user": public_user(user)}


@router.post("/me/verify-email/resend")
@limiter.limit("3/minute")
async def resend_code(request: Request, background: BackgroundTasks, user=Depends(get_current_user)):
    if user["is_verified"]:
        return {"sent": False, "verified": True}
    if not can_receive_mail(user):
        raise HTTPException(status_code=400, detail="This account has no email address to send a code to.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", user["id"])
            last = await conn.fetchval(
                "SELECT max(created_at) FROM email_otps WHERE user_id = $1", user["id"]
            )
            if last and (datetime.now(timezone.utc) - last).total_seconds() < RESEND_COOLDOWN_SECONDS:
                raise HTTPException(status_code=429, detail="Wait a minute before asking for another code.")
            sent_recently = await conn.fetchval(
                "SELECT count(*) FROM email_sends WHERE user_id = $1 AND kind = 'verify' "
                "AND sent_at > now() - interval '1 hour'",
                user["id"],
            )
            if sent_recently >= MAX_CODES_PER_HOUR:
                raise HTTPException(status_code=429, detail="That's a lot of codes. Try again in an hour.")
            await conn.execute("INSERT INTO email_sends (user_id, kind) VALUES ($1, 'verify')", user["id"])
            mail = await new_verification(conn, user)
    background.add_task(mailer.send, mail)
    return {"sent": True}


@router.post("/auth/verify-email")
@limiter.limit("10/minute")
async def verify_with_link(request: Request, body: LinkToken):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            otp = await conn.fetchrow(
                "SELECT * FROM email_otps WHERE link_hash = $1 AND expires_at > now() FOR UPDATE",
                _sha256(body.token),
            )
            if not otp:
                raise HTTPException(status_code=400, detail="This link has expired or was already used. "
                                                            "Open CipherRush to send a new code.")
            await _mark_verified(conn, otp["user_id"])
    return {"verified": True}


# --- password reset -------------------------------------------------------------

async def _find_account(conn, identifier: str):
    identifier = identifier.strip()
    if "@" in identifier:
        return await conn.fetchrow("SELECT * FROM users WHERE lower(email) = $1", normalize_email(identifier))
    return await conn.fetchrow("SELECT * FROM users WHERE lower(username) = lower($1)",
                               normalize_username(identifier))


async def send_reset_link(identifier: str) -> None:
    """Runs after the response, so how long it takes reveals nothing about the account."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            user = await _find_account(conn, identifier)
            if not user or not has_password(user) or not can_receive_mail(user):
                return
            await conn.execute("SELECT 1 FROM users WHERE id = $1 FOR UPDATE", user["id"])
            recent = await conn.fetchval(
                "SELECT 1 FROM password_resets WHERE user_id = $1 "
                "AND created_at > now() - make_interval(secs => $2)",
                user["id"], float(RESET_COOLDOWN_SECONDS),
            )
            if recent:
                return  # one email a minute per account, however often the form is sent
            token = secrets.token_urlsafe(32)
            await conn.execute("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", user["id"])
            await conn.execute(
                """INSERT INTO password_resets (user_id, token_hash, expires_at)
                   VALUES ($1, $2, now() + make_interval(mins => $3))""",
                user["id"], _sha256(token), RESET_TTL_MINUTES,
            )
    link = f"{public_base_url()}/api/auth/reset-password#{token}"
    await mailer.send(password_reset_email(user["email"], user["username"], link, RESET_TTL_MINUTES))


@router.post("/auth/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: ForgotPassword, background: BackgroundTasks):
    background.add_task(send_reset_link, body.identifier)
    return {"message": GENERIC_RESET_REPLY}


@router.post("/auth/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, response: Response, body: ResetPassword):
    try:
        validate_password(body.new_password)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            reset = await conn.fetchrow(
                """SELECT * FROM password_resets WHERE token_hash = $1
                   AND used_at IS NULL AND expires_at > now() FOR UPDATE""",
                _sha256(body.token),
            )
            if not reset:
                raise HTTPException(status_code=400, detail="This reset link has expired or was already used. "
                                                            "Ask for a new one in the app.")
            await conn.execute("UPDATE password_resets SET used_at = now() WHERE id = $1", reset["id"])
            await conn.execute("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL",
                               reset["user_id"])
            # The reset proves the player reads this inbox, so it verifies the address too.
            # Every existing session is signed out.
            await conn.execute(
                """UPDATE users SET password_hash = $2, session_version = session_version + 1,
                   is_verified = true WHERE id = $1""",
                reset["user_id"], hash_password(body.new_password),
            )
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", reset["user_id"])
    clear_session(response)
    logger.info("Password reset by email link: %s", reset["user_id"])
    return {"reset": True}


# --- the pages the email links open ---------------------------------------------

_PAGE_STYLE = """
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1220;
color:#e6edf5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;box-sizing:border-box}
main{width:100%;max-width:400px;background:#121b2e;border:1px solid #22304a;border-radius:16px;padding:28px}
.brand{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#00d4ff}
h1{font-size:22px;margin:8px 0 14px}p{line-height:1.5;color:#b7c4d6}
label{display:block;font-size:13px;margin:14px 0 6px;color:#9fb3c8}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #2b3b58;background:#0b1220;
color:#fff;font-size:16px}
button{width:100%;margin-top:20px;padding:14px;border:0;border-radius:999px;background:#00d4ff;color:#04111c;
font-size:16px;font-weight:700;cursor:pointer}button:disabled{opacity:.5}
#msg{min-height:1.5em;margin-top:14px}.bad{color:#fca5a5}.good{color:#86efac}
"""


def _page(title: str, body: str, script: str) -> HTMLResponse:
    nonce = secrets.token_urlsafe(16)
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>{title} - CipherRush</title><style nonce="{nonce}">{_PAGE_STYLE}</style></head>
<body><main><div class="brand">CipherRush</div><h1>{title}</h1>{body}<p id="msg" role="status"></p></main>
<script nonce="{nonce}">
const token = location.hash.slice(1);
history.replaceState(null, "", location.pathname);
const msg = document.getElementById("msg");
const say = (text, ok) => {{ msg.textContent = text; msg.className = ok ? "good" : "bad"; }};
async function post(path, payload) {{
  const res = await fetch(path, {{ method: "POST", credentials: "omit",
    headers: {{ "Content-Type": "application/json", "X-Requested-With": "CipherRush" }},
    body: JSON.stringify(payload) }});
  const data = await res.json().catch(() => ({{}}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "That didn't work. Try again.");
  return data;
}}
{script}
</script></body></html>"""
    return HTMLResponse(html, headers={
        "Content-Security-Policy": (f"default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; "
                                    "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"),
        "Cache-Control": "no-store",
    })


@router.get("/auth/verify-email", include_in_schema=False)
async def verify_email_page():
    return _page("Confirm your email", '<p>Confirm this address for your CipherRush account.</p>'
                 '<button id="go" type="button">Confirm email</button>', """
const go = document.getElementById("go");
if (!token) { go.disabled = true; say("This link is incomplete. Open the newest email from CipherRush."); }
go.addEventListener("click", async () => {
  go.disabled = true;
  try {
    await post("/api/auth/verify-email", { token });
    say("Email confirmed. You'll show up on the leaderboards now.", true);
    go.hidden = true;
  } catch (e) { say(e.message); go.disabled = false; }
});
""")


@router.get("/auth/reset-password", include_in_schema=False)
async def reset_password_page():
    return _page("Choose a new password", """
<form id="form" novalidate>
<label for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" required>
<label for="pw2">Repeat it</label><input id="pw2" type="password" autocomplete="new-password" required>
<p>8+ characters, with upper and lower case letters and a number.</p>
<button id="go" type="submit">Save password</button></form>""", """
const form = document.getElementById("form"), go = document.getElementById("go");
if (!token) { go.disabled = true; say("This link is incomplete. Open the newest email from CipherRush."); }
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = document.getElementById("pw").value, pw2 = document.getElementById("pw2").value;
  if (!(pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\\d/.test(pw)))
    return say("8+ characters, with upper and lower case letters and a number.");
  if (pw !== pw2) return say("The two passwords don't match.");
  go.disabled = true;
  try {
    await post("/api/auth/reset-password", { token, new_password: pw });
    form.hidden = true;
    say("Password changed. Open CipherRush and log in with it.", true);
  } catch (err) { say(err.message); go.disabled = false; }
});
""")
