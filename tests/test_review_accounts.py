"""Store review accounts (backend/scripts/provision_review_account.py).

They log in like any player but never appear on, or count toward, leaderboards,
and re-provisioning rotates the password and revokes old sessions.
"""
import asyncio
import os
import secrets
import sys
from pathlib import Path

import asyncpg
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "scripts"))

import provision_review_account as pra  # noqa: E402
from tests.conftest import CSRF, _created_usernames, db_query, random_handle  # noqa: E402
from moderation import PASSWORD_PATTERN  # noqa: E402
import rounds  # noqa: E402


def run_provision(username, email, password):
    async def go():
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            return await pra.provision(conn, username, email, password)
        finally:
            await conn.close()
    return asyncio.run(go())


@pytest.fixture
def reviewer(client):
    username = random_handle("rv_")
    _created_usernames.append(username)
    password = pra.generate_password()
    assert run_provision(username, f"{username}@example.com", password) == "created"
    return username, password


def login(client, username, password):
    client.cookies.clear()
    return client.post("/api/auth/login", json={"username": username, "password": password}, headers=CSRF)


def test_generated_passwords_are_strong_and_unambiguous():
    for _ in range(50):
        pw = pra.generate_password()
        assert len(pw) == 20 and PASSWORD_PATTERN.match(pw)
        assert not set(pw) & set("0O1lI")


def test_review_account_logs_in_with_sample_progress(client, reviewer):
    username, password = reviewer
    res = login(client, username, password)
    assert res.status_code == 200, res.text
    user = res.json()["user"]
    assert user["level"] == 2 and user["total_score"] == pra.SAMPLE_SCORE
    assert {"First Steps", "First Decrypt"} <= set(user["badges"])


def test_review_account_never_on_leaderboards(client, reviewer):
    username, _ = reviewer
    # Outscore everyone so it would be first if it were listed.
    db_query("UPDATE users SET total_score = 10000000 WHERE username = $1", username)
    names = {r["username"] for r in client.get("/api/leaderboard").json()["leaderboard"]}
    assert username not in names


def test_review_account_never_offered_as_a_versus_opponent(client, reviewer, player):
    username, _ = reviewer
    db_query("UPDATE users SET total_score = 10000000 WHERE username = $1", username)
    names = {r["username"] for r in player.get("/api/battle/queue").json()["queue"]}
    assert username not in names


def test_review_account_is_unranked(client, reviewer):
    username, _ = reviewer
    db_query("UPDATE users SET total_score = 10000000 WHERE username = $1", username)
    rows = db_query("SELECT id FROM users WHERE username = $1", username)

    async def awarded():
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            return await rounds._evaluate_common_achievements(conn, rows[0]["id"])
        finally:
            await conn.close()

    assert "high_scorer" not in asyncio.run(awarded())


def test_reprovision_rotates_password_and_revokes_sessions(client, reviewer):
    username, old_password = reviewer
    assert login(client, username, old_password).status_code == 200
    old_session = dict(client.cookies)

    new_password = pra.generate_password()
    assert run_provision(username, f"{username}@example.com", new_password) == "reset"

    assert login(client, username, old_password).status_code == 401
    client.cookies.clear()
    for name, value in old_session.items():
        client.cookies.set(name, value, path="/api")
    assert client.get("/api/auth/me").status_code == 401
    assert login(client, username, new_password).status_code == 200


def test_refuses_to_take_over_a_real_player(player):
    with pytest.raises(SystemExit):
        run_provision(player.username, "x@example.com", pra.generate_password())
    assert not db_query("SELECT is_review_account FROM users WHERE id = $1::uuid", player.id)[0]["is_review_account"]


def test_credentials_file_is_owner_only_and_must_be_gitignored(tmp_path):
    text = pra.credentials_text("https://api.example.test", [("PLAY", "play_review", "p@example.com", "Secret123abc")])
    assert "play-review" not in text and "p@example.com / play_review" in text and "Secret123abc" in text

    target = ROOT / "mobile" / "store" / "REVIEWER_CREDENTIALS.txt"
    existed = target.exists()
    if not existed:
        pra.write_credentials(target, text)
        try:
            assert target.stat().st_mode & 0o777 == 0o600
            assert target.read_text() == text
        finally:
            target.unlink()

    tracked = ROOT / "mobile" / "store" / "not-ignored.txt"
    with pytest.raises(SystemExit):
        pra.write_credentials(tracked, text)
    assert not tracked.exists()
