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


# One year, the value browsers' HSTS preload lists expect.
HSTS_VALUE = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds standard defensive HTTP headers to every response.

    `hsts` is on in production only: the API is served over HTTPS there, while
    local development runs on plain http://localhost, where browsers would
    otherwise remember to refuse it.
    """

    def __init__(self, app, hsts: bool = False):
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if self.hsts:
            response.headers["Strict-Transport-Security"] = HSTS_VALUE
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response
