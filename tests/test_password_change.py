"""Changing a password: needs the current one, enforces the strength rule,
signs every other device out and keeps this one signed in."""
from tests.conftest import CSRF, PASSWORD

NEW = "Fresh-Pass-2026"


def login(client, username, password):
    client.cookies.clear()
    return client.post("/api/auth/login", json={"username": username, "password": password}, headers=CSRF)


def test_change_password_revokes_other_sessions_and_keeps_this_one(client, make_player):
    me = make_player()
    other_device = dict(token=me.token, refresh=me.refresh_token)

    res = me.post("/api/me/password", json={"current_password": PASSWORD, "new_password": NEW})
    assert res.status_code == 200, res.text
    me._capture(res)  # the response carries this device's fresh session
    assert me.get("/api/auth/me").status_code == 200

    me.token, me.refresh_token = other_device["token"], other_device["refresh"]
    assert me.get("/api/auth/me").status_code == 401

    assert login(client, me.username, PASSWORD).status_code == 401
    assert login(client, me.username, NEW).status_code == 200


def test_wrong_current_password_is_refused(player):
    res = player.post("/api/me/password", json={"current_password": "Nope12345", "new_password": NEW})
    assert res.status_code == 400
    assert "current password" in res.json()["detail"]


def test_weak_or_unchanged_new_password_is_refused(player):
    for weak in ("short1A", "alllowercase1", PASSWORD):
        res = player.post("/api/me/password", json={"current_password": PASSWORD, "new_password": weak})
        assert res.status_code == 400, weak


def test_extra_fields_are_rejected(player):
    res = player.post("/api/me/password", json={"current_password": PASSWORD, "new_password": NEW, "user_id": "x"})
    assert res.status_code == 400  # server.py maps validation errors to 400
