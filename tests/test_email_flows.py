"""Email verification and handle / email password resets (backend/email_routes.py)."""
import hashlib
import re

import pytest

import mailer
from email_routes import GENERIC_RESET_REPLY, MAX_CODE_ATTEMPTS
from tests.conftest import CSRF, PASSWORD, db_query, latest_code, latest_email

NEW_PASSWORD = "BrandNew456x"


def link_token(mail):
    return re.search(r"#([A-Za-z0-9_-]{20,})", mail.text).group(1)


def sent_to(address):
    return [m for m in mailer.outbox if m.to == address]


def leaderboard_names(client):
    return {r["username"] for r in client.get("/api/leaderboard").json()["leaderboard"]}


def outscore_everyone(player):
    db_query("UPDATE users SET total_score = 10000000 WHERE username = $1", player.username)


def login(client, username, password):
    client.cookies.clear()
    return client.post("/api/auth/login", json={"username": username, "password": password}, headers=CSRF)


# --- verification ----------------------------------------------------------------

def test_sign_up_emails_a_code_and_link_and_starts_unverified(make_player):
    p = make_player(verified=False)
    mail = latest_email(p.email)
    code = latest_code(p.email)
    assert re.fullmatch(r"\d{6}", code)
    assert code in mail.text and code in mail.html
    assert "/api/auth/verify-email#" in mail.text
    assert p.get("/api/auth/me").json()["user"]["is_verified"] is False
    # Only hashes are stored.
    row = db_query("SELECT code_hash, link_hash FROM email_otps WHERE user_id = $1::uuid", p.id)[0]
    assert code not in row["code_hash"]
    assert row["link_hash"] == hashlib.sha256(link_token(mail).encode()).hexdigest()


def test_unverified_players_stay_off_leaderboards_until_they_verify(client, make_player):
    p = make_player(verified=False)
    outscore_everyone(p)
    assert p.username not in leaderboard_names(client)
    res = p.post("/api/me/verify-email", json={"code": latest_code(p.email)})
    assert res.status_code == 200 and res.json()["user"]["is_verified"] is True
    assert p.username in leaderboard_names(client)


def test_unverified_players_are_not_versus_opponents(make_player, player):
    p = make_player(verified=False)
    outscore_everyone(p)
    names = {r["username"] for r in player.get("/api/battle/queue").json()["queue"]}
    assert p.username not in names


def test_wrong_codes_are_counted_and_lock_the_code(make_player):
    p = make_player(verified=False)
    good = latest_code(p.email)
    wrong = f"{(int(good) + 1) % 1_000_000:06d}"
    for _ in range(MAX_CODE_ATTEMPTS):
        assert p.post("/api/me/verify-email", json={"code": wrong}).status_code == 400
    # Even the right code is refused once the code is locked.
    res = p.post("/api/me/verify-email", json={"code": good})
    assert res.status_code == 400 and "new code" in res.json()["detail"]


def test_expired_codes_are_refused(make_player):
    p = make_player(verified=False)
    db_query("UPDATE email_otps SET expires_at = now() - interval '1 second' WHERE user_id = $1::uuid", p.id)
    res = p.post("/api/me/verify-email", json={"code": latest_code(p.email)})
    assert res.status_code == 400 and "expired" in res.json()["detail"]


def test_resend_has_a_cooldown_and_replaces_the_old_code(make_player):
    p = make_player(verified=False)
    old = latest_code(p.email)
    assert p.post("/api/me/verify-email/resend").status_code == 429  # within a minute of sign-up
    db_query("UPDATE email_otps SET created_at = now() - interval '2 minutes' WHERE user_id = $1::uuid", p.id)
    assert p.post("/api/me/verify-email/resend").status_code == 200
    new = latest_code(p.email)
    assert len(sent_to(p.email)) == 2
    if new != old:
        assert p.post("/api/me/verify-email", json={"code": old}).status_code == 400
    assert p.post("/api/me/verify-email", json={"code": new}).status_code == 200


def test_the_email_link_verifies_once(client, make_player):
    p = make_player(verified=False)
    token = link_token(latest_email(p.email))
    client.cookies.clear()
    assert client.post("/api/auth/verify-email", json={"token": token}, headers=CSRF).status_code == 200
    assert p.get("/api/auth/me").json()["user"]["is_verified"] is True
    client.cookies.clear()
    assert client.post("/api/auth/verify-email", json={"token": token}, headers=CSRF).status_code == 400


def test_link_pages_keep_the_token_out_of_requests_and_lock_down_scripts(client):
    for path in ("/api/auth/verify-email", "/api/auth/reset-password"):
        res = client.get(path)
        assert res.status_code == 200 and "text/html" in res.headers["content-type"]
        csp = res.headers["content-security-policy"]
        assert "default-src 'none'" in csp and "script-src 'nonce-" in csp
        assert res.headers["cache-control"] == "no-store"
        assert "location.hash" in res.text


# --- password reset ----------------------------------------------------------------

@pytest.mark.parametrize("how", ["handle", "HANDLE", "email"])
def test_forgot_password_by_handle_or_email_mails_the_account_address(client, player, how):
    identifier = {"handle": player.username, "HANDLE": player.username.upper(), "email": player.email}[how]
    before = len(sent_to(player.email))
    res = client.post("/api/auth/forgot-password", json={"identifier": identifier}, headers=CSRF)
    assert res.status_code == 200 and res.json() == {"message": GENERIC_RESET_REPLY}
    assert len(sent_to(player.email)) == before + 1
    mail = latest_email(player.email)
    assert mail.subject == "Reset your CipherRush password" and "/api/auth/reset-password#" in mail.text


def test_forgot_password_answers_the_same_for_unknown_accounts(client):
    before = len(mailer.outbox)
    res = client.post("/api/auth/forgot-password", json={"identifier": "nobody_here_x9"}, headers=CSRF)
    assert res.status_code == 200 and res.json() == {"message": GENERIC_RESET_REPLY}
    assert len(mailer.outbox) == before


def test_one_reset_email_a_minute_per_account(client, player):
    for _ in range(3):
        client.post("/api/auth/forgot-password", json={"identifier": player.username}, headers=CSRF)
    resets = [m for m in sent_to(player.email) if "Reset" in m.subject]
    assert len(resets) == 1


def request_reset(client, player):
    client.post("/api/auth/forgot-password", json={"identifier": player.username}, headers=CSRF)
    return link_token(latest_email(player.email))


def test_reset_link_changes_the_password_once_and_signs_out_everywhere(client, player):
    token = request_reset(client, player)
    assert not db_query("SELECT 1 FROM password_resets WHERE token_hash = $1", token)  # stored hashed
    client.cookies.clear()
    res = client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}, headers=CSRF)
    assert res.status_code == 200, res.text

    assert player.get("/api/auth/me").status_code == 401  # old session revoked
    assert login(client, player.username, PASSWORD).status_code == 401
    assert login(client, player.username, NEW_PASSWORD).status_code == 200

    client.cookies.clear()
    again = client.post("/api/auth/reset-password", json={"token": token, "new_password": "Another789y"}, headers=CSRF)
    assert again.status_code == 400


def test_reset_links_expire_after_fifteen_minutes(client, player):
    token = request_reset(client, player)
    created = db_query("SELECT expires_at - created_at AS ttl FROM password_resets WHERE user_id = $1::uuid", player.id)
    assert created[0]["ttl"].total_seconds() == 15 * 60
    db_query("UPDATE password_resets SET expires_at = now() - interval '1 second' WHERE user_id = $1::uuid", player.id)
    client.cookies.clear()
    res = client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}, headers=CSRF)
    assert res.status_code == 400
    assert login(client, player.username, PASSWORD).status_code == 200


def test_weak_new_password_is_refused_without_using_up_the_link(client, player):
    token = request_reset(client, player)
    client.cookies.clear()
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "short"},
                       headers=CSRF).status_code in (400, 422)
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD},
                       headers=CSRF).status_code == 200


def test_reset_verifies_an_unverified_address(client, make_player):
    p = make_player(verified=False)
    token = request_reset(client, p)
    client.cookies.clear()
    client.post("/api/auth/reset-password", json={"token": token, "new_password": NEW_PASSWORD}, headers=CSRF)
    assert db_query("SELECT is_verified FROM users WHERE id = $1::uuid", p.id)[0]["is_verified"] is True


def test_review_accounts_never_get_reset_emails(client, player):
    db_query("UPDATE users SET is_review_account = true WHERE id = $1::uuid", player.id)
    before = len(sent_to(player.email))
    client.post("/api/auth/forgot-password", json={"identifier": player.username}, headers=CSRF)
    assert len(sent_to(player.email)) == before


# --- mailer ------------------------------------------------------------------------

class _FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code
        self.text = "{}"


def _fake_zeptomail(monkeypatch, status_code):
    calls = []

    class FakeClient:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, headers=None, json=None):
            calls.append({"url": url, "headers": headers, "json": json})
            return _FakeResponse(status_code)

    monkeypatch.setattr(mailer.httpx, "AsyncClient", FakeClient)
    monkeypatch.setenv("MAIL_BACKEND", "zeptomail")
    monkeypatch.setenv("ZEPTOMAIL_API_KEY", "test-key-not-real")
    return calls


def test_zeptomail_request_shape(monkeypatch):
    import asyncio

    calls = _fake_zeptomail(monkeypatch, 201)
    mail = mailer.Email(to="a@example.com", subject="S", text="T", html="<p>H</p>")
    assert asyncio.run(mailer.send(mail)) is True
    call = calls[0]
    assert call["url"] == mailer.ZEPTOMAIL_URL
    assert call["headers"]["Authorization"] == "Zoho-enczapikey test-key-not-real"
    body = call["json"]
    assert body["from"] == {"address": "support@aximoix.com", "name": "CipherRush Security"}
    assert body["to"] == [{"email_address": {"address": "a@example.com"}}]
    assert body["track_opens"] is False and body["track_clicks"] is False


def test_a_mail_outage_never_breaks_the_request(monkeypatch):
    import asyncio

    _fake_zeptomail(monkeypatch, 500)
    assert asyncio.run(mailer.send(mailer.Email(to="a@example.com", subject="S", text="T", html="H"))) is False
