import asyncio
import json
import os
import secrets
import sys
from pathlib import Path

import asyncpg
import pytest

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

os.environ["MAIL_BACKEND"] = "memory"  # emails land in mailer.outbox, never on the network
import mailer  # noqa: E402
import server  # noqa: E402  (loads backend/.env)
from auth import REFRESH_COOKIE, SESSION_COOKIE  # noqa: E402
from ratelimit import limiter  # noqa: E402

CSRF = {"X-Requested-With": "CipherRush"}
PASSWORD = "TestPass123"
_created_usernames = []


def db_query(sql, *args):
    """Run a query on a fresh connection (outside the app's event loop)."""
    async def run():
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()
    return asyncio.run(run())


def round_state(round_id):
    rows = db_query("SELECT state::text AS s FROM game_rounds WHERE id = $1", round_id)
    return json.loads(rows[0]["s"])


def backdate_round(round_id, seconds):
    db_query(
        "UPDATE game_rounds SET started_at = started_at - make_interval(secs => $2), "
        "expires_at = expires_at - make_interval(secs => $2) WHERE id = $1",
        round_id, float(seconds),
    )


def random_handle(prefix):
    # Random hex can spell blocked words once digits read as letters (1515 -> isis),
    # so test handles use letters no blocklist term is made of.
    return prefix + "".join(secrets.choice("qxzjvwy2") for _ in range(10))


def latest_email(to):
    return next(m for m in reversed(mailer.outbox) if m.to == to)


def latest_code(to):
    """The 6-digit code from the newest verification email to this address."""
    return latest_email(to).subject.rsplit(" ", 1)[-1]


class Player:
    """A registered user plus their session cookie, sharing one TestClient."""

    def __init__(self, client, verified=True):
        self.client = client
        self.username = random_handle("t_")
        _created_usernames.append(self.username)
        res = client.post(
            "/api/auth/register",
            json={"username": self.username, "password": PASSWORD, "email": f"{self.username}@example.com"},
            headers=CSRF,
        )
        assert res.status_code == 200, res.text
        self.id = res.json()["user"]["id"]
        self._capture(res)
        assert self.token and self.refresh_token
        self.email = f"{self.username}@example.com"
        if verified:
            res = self.post("/api/me/verify-email", json={"code": latest_code(self.email)})
            assert res.status_code == 200, res.text

    def _capture(self, res):
        self.token = res.cookies.get(SESSION_COOKIE) or getattr(self, "token", None)
        self.refresh_token = res.cookies.get(REFRESH_COOKIE) or getattr(self, "refresh_token", None)

    def _use(self):
        self.client.cookies.clear()
        self.client.cookies.set(SESSION_COOKIE, self.token, path="/api")
        self.client.cookies.set(REFRESH_COOKIE, self.refresh_token, path="/api/auth")

    def get(self, path, **kw):
        self._use()
        return self.client.get(path, **kw)

    def post(self, path, json=None, headers=None, **kw):
        self._use()
        res = self.client.post(path, json=json, headers={**CSRF, **(headers or {})}, **kw)
        if path.startswith("/api/auth/"):
            self._capture(res)
        return res


@pytest.fixture(scope="session")
def client():
    limiter.enabled = False
    with TestClient(server.app) as c:
        yield c
    if _created_usernames:
        db_query("DELETE FROM users WHERE username = ANY($1::text[])", _created_usernames)


@pytest.fixture
def player(client):
    return Player(client)


@pytest.fixture
def make_player(client):
    return lambda verified=True: Player(client, verified)
