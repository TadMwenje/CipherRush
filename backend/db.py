import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit

import asyncpg

ROOT_DIR = Path(__file__).parent
logger = logging.getLogger(__name__)

# A cold or briefly unreachable Postgres shouldn't fail the deploy: retry the
# first connection with backoff, and never wait on one attempt for long.
CONNECT_TIMEOUT_SECONDS = 10
CONNECT_ATTEMPTS = 5
CONNECT_BACKOFF_SECONDS = (2, 4, 8, 16)

_pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    # Round state is stored as JSONB; decode it to Python objects transparently.
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


def _db_host(dsn: str) -> str:
    """Host and database name only: never log the credentials in the URL."""
    parts = urlsplit(dsn)
    return f"{parts.hostname}:{parts.port or 5432}{parts.path}"


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            raise RuntimeError("DATABASE_URL is not set")
        for attempt in range(1, CONNECT_ATTEMPTS + 1):
            try:
                _pool = await asyncpg.create_pool(
                    dsn=dsn, min_size=1, max_size=10, init=_init_connection, timeout=CONNECT_TIMEOUT_SECONDS
                )
                if attempt > 1:
                    logger.info("Connected to Postgres at %s on attempt %d", _db_host(dsn), attempt)
                break
            except (OSError, asyncio.TimeoutError, asyncpg.PostgresError) as exc:
                if attempt == CONNECT_ATTEMPTS:
                    raise RuntimeError(
                        f"Couldn't connect to Postgres at {_db_host(dsn)} after {attempt} attempts: "
                        f"{type(exc).__name__}: {exc}"
                    ) from exc
                wait = CONNECT_BACKOFF_SECONDS[min(attempt, len(CONNECT_BACKOFF_SECONDS)) - 1]
                logger.warning("Postgres at %s not reachable (attempt %d/%d: %s: %s); retrying in %ds",
                               _db_host(dsn), attempt, CONNECT_ATTEMPTS, type(exc).__name__, exc, wait)
                await asyncio.sleep(wait)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


# One-off data migrations that must never run twice (unlike schema.sql, which is
# idempotent DDL re-applied on every startup). Append new entries; never edit old ones.
DATA_MIGRATIONS = [
    (
        "2026_10_rename_binary_to_truefalse",
        """
        -- The old "Binary Decrypt" mode was a true/false quiz; it becomes "truefalse"
        -- so the new binary/hex decoder mode ("binhex") gets an honest name.
        UPDATE game_sessions SET game_type = 'truefalse' WHERE game_type = 'binary';
        UPDATE game_progress SET game_type = 'truefalse' WHERE game_type = 'binary';
        UPDATE achievements
           SET badge_name = 'Fact Checker',
               description = 'Answered every True or False statement correctly'
         WHERE badge_name = 'Binary Boss';
        UPDATE users SET badges = array_replace(badges, 'Binary Boss', 'Fact Checker')
         WHERE 'Binary Boss' = ANY(badges);
        """,
    ),
    (
        "2026_10_existing_accounts_verified",
        """
        -- Email verification arrived after these accounts were made; keep them on
        -- the leaderboards rather than dropping every existing player at once.
        UPDATE users SET is_verified = true;
        """,
    ),
]


async def run_migrations() -> None:
    """Apply schema.sql (idempotent), then any data migrations not yet recorded."""
    pool = await get_pool()
    schema_sql = (ROOT_DIR / "schema.sql").read_text()
    async with pool.acquire() as conn:
        await conn.execute(schema_sql)
        for version, sql in DATA_MIGRATIONS:
            async with conn.transaction():
                inserted = await conn.fetchval(
                    "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING RETURNING version",
                    version,
                )
                if inserted:
                    await conn.execute(sql)
