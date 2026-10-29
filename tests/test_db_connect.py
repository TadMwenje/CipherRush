"""Startup resilience: a slow or briefly unreachable Postgres (backend/db.py)."""
import asyncio

import pytest

import db


@pytest.fixture
def fresh_pool(monkeypatch):
    monkeypatch.setattr(db, "_pool", None)
    monkeypatch.setattr(db, "CONNECT_BACKOFF_SECONDS", (0, 0, 0, 0))
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:s3cret@db.example:5432/cipher")
    yield
    db._pool = None


def test_a_cold_database_is_retried_until_it_answers(monkeypatch, fresh_pool, caplog):
    calls = []

    async def create_pool(**kw):
        calls.append(kw)
        if len(calls) < 3:
            raise ConnectionRefusedError("connection refused")
        return "pool"

    monkeypatch.setattr(db.asyncpg, "create_pool", create_pool)
    assert asyncio.run(db.get_pool()) == "pool"
    assert len(calls) == 3 and calls[0]["timeout"] == db.CONNECT_TIMEOUT_SECONDS
    # The log names the host, never the password in DATABASE_URL.
    assert "db.example:5432/cipher" in caplog.text and "s3cret" not in caplog.text


def test_a_database_that_never_answers_fails_with_a_clear_message(monkeypatch, fresh_pool):
    async def create_pool(**kw):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(db.asyncpg, "create_pool", create_pool)
    with pytest.raises(RuntimeError) as err:
        asyncio.run(db.get_pool())
    assert "db.example:5432/cipher" in str(err.value) and "5 attempts" in str(err.value)
    assert "s3cret" not in str(err.value)
