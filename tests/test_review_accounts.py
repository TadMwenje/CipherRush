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


# --- seeding on server start from the environment (review_accounts.seed_from_env) ---

import review_accounts  # noqa: E402


def run_seed(monkeypatch, env):
    async def go():
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            await review_accounts.seed_from_env(conn, env)
        finally:
            await conn.close()
    asyncio.run(go())


@pytest.fixture
def seeded_store(monkeypatch):
    username = random_handle("rv_")
    _created_usernames.append(username)
    monkeypatch.setattr(review_accounts, "STORES", {
        "play": ("TEST REVIEWER", username, f"{username}@example.com", "REVIEW_TEST_PASSWORD"),
    })
    return username


def session_version(username):
    return db_query("SELECT session_version FROM users WHERE username = $1", username)[0]["session_version"]


def test_startup_seed_creates_the_account_with_the_configured_password(client, monkeypatch, seeded_store):
    password = pra.generate_password()
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
    res = login(client, seeded_store, password)
    assert res.status_code == 200, res.text
    assert res.json()["user"]["level"] == 2


def test_restarts_leave_a_matching_password_and_its_sessions_alone(monkeypatch, seeded_store):
    password = pra.generate_password()
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
    before = session_version(seeded_store)
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
    assert session_version(seeded_store) == before


def test_a_changed_password_is_applied_on_the_next_start(client, monkeypatch, seeded_store):
    old, new = pra.generate_password(), pra.generate_password()
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": old})
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": new})
    assert login(client, seeded_store, old).status_code == 401
    assert login(client, seeded_store, new).status_code == 200


def test_no_password_set_means_nothing_is_created(monkeypatch, seeded_store):
    run_seed(monkeypatch, {})
    assert db_query("SELECT 1 FROM users WHERE username = $1", seeded_store) == []


def test_seeding_never_takes_over_a_real_players_handle(client, monkeypatch, player):
    monkeypatch.setattr(review_accounts, "STORES", {
        "play": ("TEST REVIEWER", player.username, "x@example.com", "REVIEW_TEST_PASSWORD"),
    })
    password = pra.generate_password()
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
    assert login(client, player.username, password).status_code == 401


# --- the real store handles, signing in the ways reviewers actually type them ---

@pytest.mark.parametrize("store", ["play", "appstore"])
def test_store_reviewer_logs_in_by_handle_or_email(client, monkeypatch, store):
    _, username, email, var = review_accounts.STORES[store]
    _created_usernames.append(username)
    password = pra.generate_password()
    run_seed(monkeypatch, {var: password})
    for typed in (username, username.upper(), f" {username} ", email, email.upper()):
        res = login(client, typed, password)
        assert res.status_code == 200, (typed, res.text)
        assert res.json()["user"]["username"] == username
    # Pasted from the store's notes, the password can pick up a trailing newline.
    assert login(client, username, password + "\n").status_code == 200
    assert login(client, username, password[:-1]).status_code == 401


def test_refused_logins_log_the_reason_but_never_the_password(client, monkeypatch, seeded_store, caplog):
    password = pra.generate_password()
    run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
    with caplog.at_level("WARNING", logger="server"):
        assert login(client, seeded_store, "Wrong" + password).status_code == 401
        assert login(client, "nobody_here_x", password).status_code == 401
        assert login(client, "nobody@example.com", password).status_code == 401
    logged = caplog.text
    assert "wrong password for user" in logged and "review account" in logged
    assert "no account with that handle ('nobody_here_x')" in logged
    assert "no account with that email" in logged and "nobody@example.com" not in logged
    assert password not in logged


def test_seeding_logs_each_decision(monkeypatch, seeded_store, caplog):
    password = pra.generate_password()
    with caplog.at_level("INFO", logger="review_accounts"):
        run_seed(monkeypatch, {})
        run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": "weak"})
        run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
        run_seed(monkeypatch, {"REVIEW_TEST_PASSWORD": password})
    logged = caplog.text
    assert "REVIEW_TEST_PASSWORD is not set" in logged
    assert "doesn't meet the password rules" in logged
    assert f"Review account {seeded_store} created" in logged
    assert "already uses the password" in logged
    assert password not in logged
