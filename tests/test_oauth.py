"""Google / Apple sign-in, account linking rules, username changes and account deletion.

Real tokens can't be minted in CI, so these tests stand in a throwaway RSA key
for Google's and Apple's published keys. Everything else - google-auth's
signature/issuer/expiry/audience checks, PyJWT's for Apple - runs for real.
"""
import datetime as dt
import hashlib
import time
import uuid

import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

import oauth
from auth import SESSION_COOKIE
from tests.conftest import CSRF, PASSWORD, db_query

GOOGLE_AUD = "test-web-client.apps.googleusercontent.com"
APPLE_AUD = "com.aximoix.cipherrush"
KID = "test-kid"

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_created_emails = []


def _cert_pem(key):
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(1).not_valid_before(now - dt.timedelta(days=1))
            .not_valid_after(now + dt.timedelta(days=1)).sign(key, hashes.SHA256()))
    return cert.public_bytes(serialization.Encoding.PEM).decode()


def _pem(key):
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.NoEncryption())


def fresh_email():
    email = f"oauth_{uuid.uuid4().hex[:10]}@example.com"
    _created_emails.append(email)
    return email


def google_token(email=None, *, aud=GOOGLE_AUD, iss="https://accounts.google.com", sub=None,
                 verified=True, exp_in=600, key=None, nonce=None, name="Test Player"):
    now = int(time.time())
    claims = {"iss": iss, "aud": aud, "sub": sub or uuid.uuid4().hex, "email": email or fresh_email(),
              "email_verified": verified, "iat": now, "exp": now + exp_in, "name": name}
    if nonce:
        claims["nonce"] = nonce
    return jwt.encode(claims, _pem(key or _key), algorithm="RS256", headers={"kid": KID}), claims


def apple_token(email=None, *, aud=APPLE_AUD, iss="https://appleid.apple.com", sub=None, nonce=None,
                exp_in=600, key=None):
    now = int(time.time())
    claims = {"iss": iss, "aud": aud, "sub": sub or f"001234.{uuid.uuid4().hex}.0101",
              "email": email or fresh_email(), "email_verified": "true", "iat": now, "exp": now + exp_in}
    if nonce:
        claims["nonce"] = hashlib.sha256(nonce.encode()).hexdigest()
    return jwt.encode(claims, _pem(key or _key), algorithm="RS256", headers={"kid": KID}), claims


@pytest.fixture(autouse=True)
def providers(monkeypatch):
    import google.oauth2.id_token as gid
    monkeypatch.setenv("GOOGLE_CLIENT_IDS", f"{GOOGLE_AUD},ios-client.apps.googleusercontent.com")
    monkeypatch.setenv("APPLE_CLIENT_IDS", f"{APPLE_AUD},com.aximoix.cipherrush.web")
    monkeypatch.setattr(gid, "_fetch_certs", lambda request, url: {KID: _cert_pem(_key)})
    monkeypatch.setattr(oauth, "apple_signing_key", lambda token: _key.public_key())
    yield


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    if _created_emails:
        db_query("DELETE FROM users WHERE email = ANY($1::text[])", _created_emails)


def sign_in(client, provider, body):
    client.cookies.clear()
    return client.post(f"/api/auth/{provider}", json=body, headers=CSRF)


# --- Google -------------------------------------------------------------------------

def test_providers_endpoint_reflects_configuration(client, monkeypatch):
    assert client.get("/api/auth/providers").json() == {"google": True, "apple": True}
    monkeypatch.setenv("GOOGLE_CLIENT_IDS", "")
    assert client.get("/api/auth/providers").json()["google"] is False


def test_google_sign_in_creates_account_and_session(client):
    token, claims = google_token()
    res = sign_in(client, "google", {"id_token": token})
    assert res.status_code == 200, res.text
    assert res.json()["created"] is True
    assert res.cookies.get(SESSION_COOKIE)
    assert client.get("/api/auth/me").json()["user"]["username"] == res.json()["user"]["username"]

    again = sign_in(client, "google", {"id_token": google_token(claims["email"], sub=claims["sub"])[0]})
    assert again.json()["created"] is False and again.json()["user"]["id"] == res.json()["user"]["id"]


@pytest.mark.parametrize("bad", [
    {"aud": "someone-elses-app.apps.googleusercontent.com"},
    {"iss": "https://evil.example.com"},
    {"exp_in": -3600},
    {"key": _other_key},
])
def test_google_rejects_spoofed_tokens(client, bad):
    token, _ = google_token(**bad)
    assert sign_in(client, "google", {"id_token": token}).status_code == 401


def test_google_rejects_unverified_email(client):
    token, _ = google_token(verified=False)
    assert sign_in(client, "google", {"id_token": token}).status_code == 401


def test_google_nonce_must_match(client):
    token, _ = google_token(nonce="abc123")
    assert sign_in(client, "google", {"id_token": token, "nonce": "different"}).status_code == 401
    assert sign_in(client, "google", {"id_token": token, "nonce": "abc123"}).status_code == 200


def test_not_configured_returns_503(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_IDS", "")
    token, _ = google_token()
    assert sign_in(client, "google", {"id_token": token}).status_code == 503


def test_no_silent_merge_into_existing_password_account(client):
    """Account pre-hijacking defence: someone registers your email with a password
    first; signing in with Google must not drop you into their account."""
    email = fresh_email()
    client.cookies.clear()
    reg = client.post("/api/auth/register", headers=CSRF,
                      json={"username": f"t_{uuid.uuid4().hex[:8]}", "password": PASSWORD, "email": email})
    assert reg.status_code == 200
    token, _ = google_token(email)
    assert sign_in(client, "google", {"id_token": token}).status_code == 409


def test_oauth_only_account_has_no_password_login(client):
    token, _ = google_token()
    username = sign_in(client, "google", {"id_token": token}).json()["user"]["username"]
    client.cookies.clear()
    res = client.post("/api/auth/login", json={"username": username, "password": "!oauth-only"}, headers=CSRF)
    assert res.status_code == 401


def test_extra_fields_rejected(client):
    token, _ = google_token()
    assert sign_in(client, "google", {"id_token": token, "user_id": "x"}).status_code == 400


# --- Apple --------------------------------------------------------------------------

def test_apple_sign_in_with_nonce_and_first_time_name(client):
    token, _ = apple_token(nonce="raw-nonce-1")
    res = sign_in(client, "apple", {"identity_token": token, "nonce": "raw-nonce-1",
                                    "given_name": "Ada", "family_name": "Lovelace"})
    assert res.status_code == 200, res.text
    assert res.json()["user"]["username"].startswith("ada_lovelace")


@pytest.mark.parametrize("bad", [
    {"aud": "com.someone.else"},
    {"iss": "https://accounts.google.com"},
    {"exp_in": -3600},
    {"key": _other_key},
])
def test_apple_rejects_spoofed_tokens(client, bad):
    token, _ = apple_token(**bad)
    assert sign_in(client, "apple", {"identity_token": token}).status_code == 401


def test_apple_nonce_mismatch_rejected(client):
    token, _ = apple_token(nonce="the-real-one")
    assert sign_in(client, "apple", {"identity_token": token, "nonce": "replayed"}).status_code == 401


# --- account management -----------------------------------------------------------------

def test_change_username(client):
    token, _ = google_token()
    sign_in(client, "google", {"id_token": token})
    new = f"renamed_{uuid.uuid4().hex[:6]}"
    res = client.post("/api/me/username", json={"username": new}, headers=CSRF)
    assert res.status_code == 200 and res.json()["user"]["username"] == new
    assert client.post("/api/me/username", json={"username": "x"}, headers=CSRF).status_code == 400
    assert client.post("/api/me/username", json={"username": "admin_boss"}, headers=CSRF).status_code == 400


def test_account_details(client):
    token, claims = google_token()
    sign_in(client, "google", {"id_token": token})
    details = client.get("/api/me/account").json()
    assert details == {"username": details["username"], "email": claims["email"], "has_password": False, "is_verified": True,
                       "providers": ["google"]}


def test_delete_account_removes_everything_and_revokes_apple(client, monkeypatch):
    revoked = []
    monkeypatch.setattr(oauth, "apple_exchange_code", _async_return("apple-refresh-token"))
    monkeypatch.setattr(oauth, "apple_revoke", _async_record(revoked))

    token, claims = apple_token()
    res = sign_in(client, "apple", {"identity_token": token, "authorization_code": "one-time-code"})
    user_id = res.json()["user"]["id"]
    session = res.cookies.get(SESSION_COOKIE)
    client.post("/api/games/match3/rounds", headers=CSRF)  # leave some data behind to cascade

    assert client.post("/api/me/delete", json={}, headers=CSRF).status_code == 400  # confirm required
    assert client.post("/api/me/delete", json={"confirm": "DELETE"}, headers=CSRF).json() == {"deleted": True}

    assert revoked == [("apple-refresh-token", APPLE_AUD)]
    for table in ("users", "user_identities", "game_rounds"):
        col = "id" if table == "users" else "user_id"
        assert db_query(f"SELECT count(*) AS n FROM {table} WHERE {col} = $1", uuid.UUID(user_id))[0]["n"] == 0
    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE, session, path="/api")
    assert client.get("/api/auth/me").status_code == 401

    # Signing in again with the same Apple ID starts a brand-new account.
    again = sign_in(client, "apple", {"identity_token": apple_token(claims["email"], sub=claims["sub"])[0]})
    assert again.json()["created"] is True


def _async_return(value):
    async def fn(*args, **kwargs):
        return value
    return fn


def _async_record(calls):
    async def fn(token, client_id):
        calls.append((token, client_id))
        return True
    return fn


# --- linking a handle and password to a Google / Apple account ----------------------

from tests.conftest import latest_code, latest_email, random_handle  # noqa: E402

LINKED_PASSWORD = "Linked1234abc"


def google_account(client):
    token, claims = google_token()
    res = sign_in(client, "google", {"id_token": token})
    assert res.status_code == 200, res.text
    return claims["email"]


def link(client, username, password=LINKED_PASSWORD):
    return client.post("/api/me/link-credentials", json={"username": username, "password": password}, headers=CSRF)


def test_google_account_links_a_handle_and_password_then_confirms_its_email(client):
    email = google_account(client)
    handle = random_handle("g_")
    res = link(client, handle)
    assert res.status_code == 200, res.text
    assert res.json()["verification_sent"] is True
    assert res.json()["user"]["username"] == handle and res.json()["user"]["is_verified"] is False

    details = client.get("/api/me/account").json()
    assert details["has_password"] is True and details["providers"] == ["google"]
    assert latest_email(email).subject.startswith("Your CipherRush code")

    res = client.post("/api/me/verify-email", json={"code": latest_code(email)}, headers=CSRF)
    assert res.status_code == 200 and res.json()["user"]["is_verified"] is True

    client.cookies.clear()
    login = client.post("/api/auth/login", json={"username": handle, "password": LINKED_PASSWORD}, headers=CSRF)
    assert login.status_code == 200, login.text


def test_linked_account_can_reset_its_password_by_handle(client):
    email = google_account(client)
    handle = random_handle("g_")
    assert link(client, handle).status_code == 200
    client.cookies.clear()
    client.post("/api/auth/forgot-password", json={"identifier": handle}, headers=CSRF)
    assert latest_email(email).subject == "Reset your CipherRush password"


def test_link_is_refused_once_a_password_exists(client):
    google_account(client)
    assert link(client, random_handle("g_")).status_code == 200
    res = link(client, random_handle("g_"), "Another999zz")
    assert res.status_code == 400 and "already has a password" in res.json()["detail"]


def test_link_enforces_the_handle_filter_password_rules_and_uniqueness(client, player):
    google_account(client)
    assert link(client, "n1gg3r_x").status_code == 400
    assert link(client, random_handle("g_"), "weak").status_code == 400
    assert link(client, player.username).status_code == 409
    # Nothing was saved by the failed attempts.
    assert client.get("/api/me/account").json()["has_password"] is False


def test_link_keeps_placeholder_email_accounts_verified_and_sends_nothing(client):
    token, claims = apple_token()
    claims_email = claims["email"]
    sign_in(client, "apple", {"identity_token": token})
    placeholder = f"apple-{uuid.uuid4().hex}@users.cipherrush.invalid"
    _created_emails.append(placeholder)  # so the module cleanup still finds it
    db_query("UPDATE users SET email = $1 WHERE email = $2", placeholder, claims_email)
    res = link(client, random_handle("a_"))
    assert res.status_code == 200, res.text
    assert res.json()["verification_sent"] is False and res.json()["user"]["is_verified"] is True
