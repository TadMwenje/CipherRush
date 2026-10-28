"""Password hashing and HTTP security headers."""
import bcrypt
from starlette.middleware.base import BaseHTTPMiddleware

BCRYPT_ROUNDS = 12
MAX_PASSWORD_BYTES = 72  # bcrypt's hard limit


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def has_password(user) -> bool:
    """False for Google / Apple-only accounts, whose hash is a "!" placeholder."""
    return bool(user["password_hash"]) and not user["password_hash"].startswith("!")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # Malformed/legacy hash (e.g. a pre-bcrypt sha256 digest) - treat as no match.
        return False


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds standard defensive HTTP headers to every response."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response
