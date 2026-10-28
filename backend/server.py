import logging
import os
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, EmailStr, Field, field_validator  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from auth import (  # noqa: E402
    CSRF_HEADER,
    CSRFHeaderMiddleware,
    clear_session,
    get_current_user,
    issue_session,
    public_user,
    refresh_session,
)
from account_routes import router as account_router  # noqa: E402
from daily_routes import router as daily_router  # noqa: E402
from db import close_pool, get_pool, run_migrations  # noqa: E402
from game_routes import router as game_router  # noqa: E402
from leveling import xp_progress  # noqa: E402
from moderation import (  # noqa: E402
    ValidationError,
    normalize_email,
    normalize_username,
    validate_password,
    validate_username,
)
from ratelimit import limiter  # noqa: E402
from rounds import GAME_TYPES, REQUEST_ID_HEADER, game_progress_for  # noqa: E402
from security import SecurityHeadersMiddleware, hash_password, verify_password  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

api_router = APIRouter(prefix="/api")

# A precomputed hash so failed logins for unknown usernames cost the same bcrypt
# work as wrong passwords - no username enumeration via response timing.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


# --- MODELS ---

class UserCreate(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=128)
    email: EmailStr

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: str) -> str:
        try:
            return validate_username(v)
        except ValidationError as exc:
            raise ValueError(str(exc))

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: EmailStr) -> str:
        return normalize_email(str(v))

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        try:
            validate_password(v)
        except ValidationError as exc:
            raise ValueError(str(exc))
        return v


class UserLogin(BaseModel):
    username: str = Field(max_length=50)
    password: str = Field(max_length=128)


_public_user = public_user


# --- AUTH ---

@api_router.post("/auth/register")
@limiter.limit("5/minute")
async def register_user(request: Request, response: Response, user_data: UserCreate):
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            user = await conn.fetchrow(
                "INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING *",
                user_data.username, hash_password(user_data.password), user_data.email,
            )
        except asyncpg.UniqueViolationError as exc:
            constraint = (getattr(exc, "constraint_name", "") or "").lower()
            if "username" in constraint:
                raise HTTPException(status_code=409, detail="That handle's taken. Try another.")
            if "email" in constraint:
                raise HTTPException(status_code=409, detail="That email already has an account. Log in instead.")
            raise HTTPException(status_code=409, detail="An account with those details already exists.")
        # Signing up logs you straight in.
        await issue_session(conn, response, user["id"], user["session_version"])
    return {"message": "Account created", "user": _public_user(user)}


@api_router.post("/auth/login")
@limiter.limit("10/minute")
async def login_user(request: Request, response: Response, login_data: UserLogin):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT * FROM users WHERE username = $1", normalize_username(login_data.username)
        )
        password_ok = verify_password(login_data.password, user["password_hash"] if user else _DUMMY_HASH)
        if not user or not password_ok:
            raise HTTPException(status_code=401, detail="Wrong handle or password.")
        await conn.execute("UPDATE users SET last_active = now() WHERE id = $1", user["id"])
        await issue_session(conn, response, user["id"], user["session_version"])
    return {"message": "Login successful", "user": _public_user(user)}


@api_router.post("/auth/refresh")
@limiter.limit("30/minute")
async def refresh_tokens(request: Request, response: Response):
    user = await refresh_session(request, response)
    return {"user": _public_user(user)}


@api_router.post("/auth/logout")
async def logout_user(response: Response, user=Depends(get_current_user)):
    # Bumping the version revokes every token minted for this account so far.
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET session_version = session_version + 1 WHERE id = $1", user["id"])
        await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user["id"])
    clear_session(response)
    return {"message": "Logged out"}


@api_router.get("/auth/me")
async def current_session(user=Depends(get_current_user)):
    return {"user": _public_user(user)}


# --- THE SIGNED-IN USER'S OWN DATA ---

@api_router.get("/me/dashboard")
async def my_dashboard(user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        total_sessions = await conn.fetchval("SELECT count(*) FROM game_sessions WHERE user_id = $1", user["id"])
        recent = await conn.fetch(
            "SELECT badge_name, description, earned_at FROM achievements WHERE user_id = $1 "
            "ORDER BY earned_at DESC LIMIT 3",
            user["id"],
        )
    progress = xp_progress(user["total_score"])
    return {
        "level": user["level"],
        "total_score": user["total_score"],
        "puzzles_completed": user["puzzles_completed"],
        "badges_count": len(user["badges"]),
        "total_sessions": total_sessions,
        "recent_achievements": [dict(a) for a in recent],
        "xp_into_level": progress["xp_into_level"],
        "xp_for_next_level": progress["xp_for_next_level"],
        "level_percent": progress["percent"],
    }


@api_router.get("/me/game-progress")
async def my_game_progress(user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        games = {g: await game_progress_for(conn, user["id"], g) for g in GAME_TYPES}
    return {"games": games}


@api_router.get("/me/profile")
async def my_profile(user=Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        history = await conn.fetch(
            """
            SELECT game_type, level, score, completed, started_at, completed_at
            FROM game_sessions WHERE user_id = $1
            ORDER BY completed_at DESC NULLS LAST, started_at DESC LIMIT 20
            """,
            user["id"],
        )
        achievements = await conn.fetch(
            "SELECT badge_name, description, earned_at FROM achievements WHERE user_id = $1 ORDER BY earned_at DESC",
            user["id"],
        )
    return {
        "id": str(user["id"]),
        "username": user["username"],
        "email": user["email"],
        "level": user["level"],
        "total_score": user["total_score"],
        "puzzles_completed": user["puzzles_completed"],
        "badges": user["badges"],
        "member_since": user["created_at"],
        "game_history": [
            {
                "game_type": h["game_type"],
                "level": h["level"],
                "score": h["score"],
                "completed": h["completed"],
                "played_at": h["completed_at"] or h["started_at"],
            }
            for h in history
        ],
        "achievements": [dict(a) for a in achievements],
    }


@api_router.get("/battle/queue")
async def battle_queue(user=Depends(get_current_user)):
    """Versus mode is a placeholder: surfaces real top players as a preview of future matchmaking."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT username, level, total_score FROM users
               WHERE id != $1 AND NOT is_review_account
               ORDER BY total_score DESC LIMIT 5""",
            user["id"],
        )
    return {
        "status": "matchmaking_coming_soon",
        "queue": [{"username": r["username"], "level": r["level"], "score": r["total_score"]} for r in rows],
    }


# --- PUBLIC LEADERBOARDS (usernames and scores only) ---

@api_router.get("/leaderboard")
async def get_leaderboard():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT u.username, u.level, u.total_score, u.puzzles_completed,
                   COALESCE(gs.games_played, 0) AS games_played,
                   COALESCE(ac.achievements_count, 0) AS achievements_count
            FROM users u
            LEFT JOIN (SELECT user_id, count(*) AS games_played FROM game_sessions GROUP BY user_id) gs
                   ON gs.user_id = u.id
            LEFT JOIN (SELECT user_id, count(*) AS achievements_count FROM achievements GROUP BY user_id) ac
                   ON ac.user_id = u.id
            WHERE NOT u.is_review_account
            ORDER BY u.total_score DESC
            LIMIT 10
            """
        )
    return {
        "leaderboard": [
            {
                "rank": i + 1,
                "username": r["username"],
                "level": r["level"],
                "score": r["total_score"],
                "puzzles_completed": r["puzzles_completed"],
                "games_played": r["games_played"],
                "achievements_count": r["achievements_count"],
            }
            for i, r in enumerate(rows)
        ]
    }


@api_router.get("/leaderboard/rush")
async def get_rush_leaderboard():
    """Best single Speed Cipher Rush run per player."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT u.username, max(gs.score) AS best, count(*) AS runs
            FROM game_sessions gs JOIN users u ON u.id = gs.user_id
            WHERE gs.game_type = 'rush' AND NOT u.is_review_account
            GROUP BY u.username
            ORDER BY best DESC
            LIMIT 10
            """
        )
    return {
        "leaderboard": [
            {"rank": i + 1, "username": r["username"], "best_score": r["best"], "runs": r["runs"]}
            for i, r in enumerate(rows)
        ]
    }


app.include_router(api_router)
app.include_router(game_router)
app.include_router(daily_router)
app.include_router(account_router)

# --- MIDDLEWARE ---

_cors_origins_env = os.environ.get("CORS_ORIGINS", "http://localhost:3001,http://localhost:3000")
CORS_ORIGINS = [origin.strip() for origin in _cors_origins_env.split(",") if origin.strip()]

app.add_middleware(CSRFHeaderMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", CSRF_HEADER, REQUEST_ID_HEADER],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Surface pydantic validator messages (username/password rules) as a clean 400."""
    first_error = exc.errors()[0] if exc.errors() else None
    message = first_error["msg"].replace("Value error, ", "") if first_error else "Invalid input"
    return JSONResponse(status_code=400, content={"detail": message})


def production_config_problems(env=os.environ) -> list:
    """Settings that must hold before a production server takes traffic."""
    if env.get("ENVIRONMENT", "").lower() != "production":
        return []
    problems = []
    if len(env.get("JWT_SECRET", "")) < 32:
        problems.append("JWT_SECRET must be 32+ characters (an ephemeral one would sign everyone out on every restart)")
    if env.get("COOKIE_SECURE", "").lower() != "true":
        problems.append("COOKIE_SECURE must be true (session cookies over HTTPS only)")
    if not env.get("DATABASE_URL"):
        problems.append("DATABASE_URL is not set")
    origins = [o.strip() for o in env.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if not origins or any(o.startswith("http://") for o in origins):
        problems.append("CORS_ORIGINS must list only HTTPS / app origins (no http://)")
    return problems


@app.on_event("startup")
async def startup_db_client():
    problems = production_config_problems()
    if problems:
        # Fail the deploy loudly rather than serve with unsafe settings.
        raise RuntimeError("Refusing to start in production: " + "; ".join(problems))
    await run_migrations()


@app.on_event("shutdown")
async def shutdown_db_client():
    await close_pool()
