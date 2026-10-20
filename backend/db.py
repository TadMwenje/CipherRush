import json
import os
from pathlib import Path
from typing import Optional

import asyncpg

ROOT_DIR = Path(__file__).parent

_pool: Optional[asyncpg.Pool] = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    # Round state is stored as JSONB; decode it to Python objects transparently.
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.environ["DATABASE_URL"], min_size=1, max_size=10, init=_init_connection
        )
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
