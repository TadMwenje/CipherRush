"""Regression tests for every score-tampering and data-exposure finding in the
Agent VORA evaluation (2026-10-20). Each test replays the original forgery
against the new server-authoritative API and asserts it no longer works."""
import time

import jwt
import pytest

from tests.conftest import CSRF, backdate_round, db_query, round_state
from auth import SESSION_COOKIE
from ratelimit import limiter


def total_score(player):
    return player.get("/api/me/dashboard").json()["total_score"]


# --- authentication & sessions --------------------------------------------------

def test_protected_endpoints_require_a_session(client):
    client.cookies.clear()
    for path in ["/api/me/dashboard", "/api/me/profile", "/api/me/game-progress", "/api/auth/me", "/api/battle/queue"]:
        assert client.get(path).status_code == 401, path
    assert client.post("/api/games/match3/rounds", headers=CSRF).status_code == 401


def test_legacy_user_id_endpoints_are_gone(player):
    for path in [f"/api/user/{player.id}/profile", f"/api/user/{player.id}/dashboard",
                 f"/api/user/{player.id}/game-progress", "/api/game/cipher/generate/3"]:
        assert player.get(path).status_code == 404, path


def test_profile_shows_only_the_session_owner(make_player):
    alice, bob = make_player(), make_player()
    profile = bob.get("/api/me/profile").json()
    assert profile["username"] == bob.username
    assert alice.username not in str(profile)


def test_tampered_and_expired_tokens_are_rejected(player):
    claims = jwt.decode(player.token, options={"verify_signature": False})
    forged = jwt.encode({**claims, "sub": claims["sub"]}, "attacker-secret", algorithm="HS256")
    player.client.cookies.clear()
    player.client.cookies.set(SESSION_COOKIE, forged, path="/api")
    assert player.client.get("/api/auth/me").status_code == 401

    import auth
    expired = jwt.encode({**claims, "iat": int(time.time()) - 7200, "exp": int(time.time()) - 3600},
                         auth._secret(), algorithm="HS256")
    player.client.cookies.set(SESSION_COOKIE, expired, path="/api")
    assert player.client.get("/api/auth/me").status_code == 401


def test_logout_revokes_the_token(player):
    stolen = player.token
    assert player.post("/api/auth/logout").status_code == 200
    player.client.cookies.clear()
    player.client.cookies.set(SESSION_COOKIE, stolen, path="/api")
    assert player.client.get("/api/auth/me").status_code == 401


def test_state_changing_requests_need_the_csrf_header(player):
    player._use()
    assert player.client.post("/api/games/match3/rounds").status_code == 403


def test_login_rate_limit(client):
    limiter.reset()
    limiter.enabled = True
    try:
        codes = [client.post("/api/auth/login", json={"username": "nobody_here", "password": "x"},
                             headers=CSRF).status_code for _ in range(12)]
    finally:
        limiter.enabled = False
    assert codes[:10] == [401] * 10
    assert 429 in codes[10:]


# --- cipher ------------------------------------------------------------------------

def test_cipher_start_does_not_leak_the_answer(player):
    data = player.post("/api/games/cipher/rounds", json={"variant": "caesar"}).json()
    state = round_state(data["round_id"])
    assert state["plaintext"] not in str(data)
    for leaked in ("plaintext", "original_text", "shift", "shift_amount", "key"):
        assert leaked not in data


@pytest.mark.parametrize("forged", [
    {"answer": "x", "level": 50},
    {"answer": "x", "time_taken": -5000},
    {"answer": "x", "original_text": "x"},
    {"answer": "x", "user_id": "00000000-0000-0000-0000-000000000000"},
])
def test_cipher_rejects_client_supplied_scoring_fields(player, forged):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    res = player.post(f"/api/games/cipher/rounds/{rid}/submit", json=forged)
    assert res.status_code == 400


def test_cipher_empty_answer_scores_nothing(player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    res = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": ""}).json()
    assert res["correct"] is False and res["score"] == 0
    assert total_score(player) == 0


def test_cipher_correct_answer_scores_within_bounds_and_cannot_replay(player):
    rid = player.post("/api/games/cipher/rounds", json={"variant": "atbash"}).json()["round_id"]
    answer = round_state(rid)["plaintext"].lower()
    res = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer})
    body = res.json()
    assert body["correct"] is True
    assert 0 < body["score"] <= 80 * 1.5  # level-1 Atbash base (80) + at most 50% time bonus
    replay = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer})
    assert replay.status_code == 409
    assert total_score(player) == body["score"]


def test_cipher_late_answer_times_out(player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    answer = round_state(rid)["plaintext"]
    backdate_round(rid, 400)
    res = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer}).json()
    assert res["correct"] is False and res["timed_out"] is True and res["score"] == 0


def test_cipher_hints_cost_points(player):
    rid = player.post("/api/games/cipher/rounds", json={"variant": "vigenere"}).json()["round_id"]
    assert player.post(f"/api/games/cipher/rounds/{rid}/hint").status_code == 200
    answer = round_state(rid)["plaintext"]
    body = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer}).json()
    assert body["correct"] and body["hint_penalty"] > 0
    assert any(a["key"] == "codebreaker" for a in body["new_achievements"])


def test_cannot_play_another_users_round(make_player):
    alice, mallory = make_player(), make_player()
    rid = alice.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    answer = round_state(rid)["plaintext"]
    assert mallory.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer}).status_code == 404


def test_puzzles_do_not_repeat_back_to_back(player):
    seen = []
    for _ in range(6):
        rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
        seen.append(round_state(rid)["plaintext"])
    assert len(set(seen)) == len(seen)


# --- quiz --------------------------------------------------------------------------

def test_quiz_start_has_no_answer_key(player):
    data = player.post("/api/games/quiz/rounds", json={"category": "phishing"}).json()
    assert "original_data" not in data
    assert all("correct_answer" not in q for q in data["questions"])


def test_quiz_forged_answer_key_is_rejected(player):
    rid = player.post("/api/games/quiz/rounds", json={"category": "phishing"}).json()["round_id"]
    res = player.post(f"/api/games/quiz/rounds/{rid}/submit",
                      json={"answers": [0], "original_questions": [{"correct_answer": 0}]})
    assert res.status_code == 400


def test_quiz_correct_answers_score_100_percent(player):
    """The original bug: correct answers always scored 0%."""
    data = player.post("/api/games/quiz/rounds", json={"category": "cryptography"}).json()
    correct = [item["correct"] for item in round_state(data["round_id"])["items"]]
    body = player.post(f"/api/games/quiz/rounds/{data['round_id']}/submit", json={"answers": correct}).json()
    assert body["percent"] == 100
    assert body["score"] == 30 * len(correct)
    assert all(r["explanation"] for r in body["results"])


def test_quiz_wrong_answer_count_is_rejected(player):
    rid = player.post("/api/games/quiz/rounds", json={"category": "phishing"}).json()["round_id"]
    assert player.post(f"/api/games/quiz/rounds/{rid}/submit", json={"answers": [0]}).status_code == 400


# --- true or false -----------------------------------------------------------------

def test_truefalse_must_answer_in_order_and_scores_server_side(player):
    data = player.post("/api/games/truefalse/rounds").json()
    assert "original_data" not in data
    rid = data["round_id"]
    assert player.post(f"/api/games/truefalse/rounds/{rid}/answer", json={"index": 3, "answer": True}).status_code == 400

    from content import TRUE_FALSE_STATEMENTS
    items = round_state(rid)["items"]
    last = None
    for i, sid in enumerate(items):
        last = player.post(f"/api/games/truefalse/rounds/{rid}/answer",
                           json={"index": i, "answer": TRUE_FALSE_STATEMENTS[sid]["answer"]}).json()
    assert last["finished"] and last["result"]["perfect"]
    assert last["result"]["score"] == round_state(rid)["points"] > 12 * len(items)


# --- binary / hex decoder ----------------------------------------------------------

def test_binhex_round(player):
    data = player.post("/api/games/binhex/rounds").json()
    rid = data["round_id"]
    words = [it["word"] for it in round_state(rid)["items"]]
    assert all(w not in str(data) for w in words)
    for i, w in enumerate(words):
        last = player.post(f"/api/games/binhex/rounds/{rid}/answer", json={"index": i, "answer": w.lower()}).json()
        assert last["correct"]
    assert last["result"]["perfect"] and last["result"]["score"] == round_state(rid)["points"] >= 150


# --- match-3 -----------------------------------------------------------------------

def test_match3_forged_score_rejected(player):
    rid = player.post("/api/games/match3/rounds").json()["round_id"]
    assert player.post(f"/api/games/match3/rounds/{rid}/swap",
                       json={"a": [0, 0], "b": [0, 1], "score": 5000}).status_code == 400


def test_match3_rejects_non_adjacent_and_off_board_swaps(player):
    rid = player.post("/api/games/match3/rounds").json()["round_id"]
    assert player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": [0, 0], "b": [2, 2]}).status_code == 400
    assert player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": [0, 0], "b": [0, -1]}).status_code == 400


def test_match3_score_comes_only_from_server_resolution(player):
    import match3_engine
    rid = player.post("/api/games/match3/rounds").json()["round_id"]
    board = round_state(rid)["board"]
    a, b = match3_engine.find_valid_move(board)
    body = player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": list(a), "b": list(b)}).json()
    assert body["valid"] and body["gained"] > 0
    assert body["score"] == round_state(rid)["score"] == sum(s["gained"] for s in body["steps"])


def test_match3_params_are_always_playable():
    import economy
    for level in (1, 5, 50, 200):
        params = economy.match3_params(level)
        assert params["target"] > 0 and params["moves"] > 0 and params["size"] == 6


# --- memory ------------------------------------------------------------------------

def test_memory_forged_pairs_rejected_and_real_solve_scores(player):
    data = player.post("/api/games/memory/rounds").json()
    rid = data["round_id"]
    assert player.post(f"/api/games/memory/rounds/{rid}/flip", json={"index": 0, "pairs": 50}).status_code == 400
    assert player.post(f"/api/games/memory/rounds/{rid}/flip", json={"index": 99}).status_code == 400

    deck = round_state(rid)["deck"]
    positions = {}
    for i, s in enumerate(deck):
        positions.setdefault(s, []).append(i)
    last = None
    for first, second in positions.values():
        player.post(f"/api/games/memory/rounds/{rid}/flip", json={"index": first})
        last = player.post(f"/api/games/memory/rounds/{rid}/flip", json={"index": second}).json()
    assert last["finished"] and last["result"]["perfect"]
    assert last["result"]["score"] == data["pairs"] * 25


# --- speed cipher rush ---------------------------------------------------------------

def test_rush_answers_after_time_up_score_nothing(player):
    data = player.post("/api/games/rush/rounds").json()
    rid = data["round_id"]
    word = round_state(rid)["puzzle"]["word"]
    ok = player.post(f"/api/games/rush/rounds/{rid}/answer", json={"answer": word}).json()
    assert ok["correct"] and ok["score"] == 15

    backdate_round(rid, 200)
    late_word = round_state(rid)["puzzle"]["word"]
    late = player.post(f"/api/games/rush/rounds/{rid}/answer", json={"answer": late_word}).json()
    assert late["finished"] and late["result"]["score"] == 15
    lb = player.get("/api/leaderboard/rush").json()["leaderboard"]
    assert any(r["username"] == player.username for r in lb) or len(lb) == 10


def test_rush_combo_multiplier(player):
    rid = player.post("/api/games/rush/rounds").json()["round_id"]
    points = []
    for _ in range(3):
        word = round_state(rid)["puzzle"]["word"]
        points.append(player.post(f"/api/games/rush/rounds/{rid}/answer", json={"answer": word}).json()["points"])
    assert points == [15, 22, 27]  # tapered: 1x, 1.5x, 1.83x


def test_forged_requests_from_the_report_cannot_reach_the_leaderboard(player):
    """The six forged requests that took an account to level 14 / 20,800 pts."""
    forged = [
        ("/api/game/cipher/submit", {"user_id": player.id, "answer": "x", "original_text": "x", "level": 50, "time_taken": -5000}),
        ("/api/game/quiz/submit", {"user_id": player.id, "answers": [0], "original_questions": [{"correct_answer": 0}]}),
        ("/api/game/match3/submit", {"user_id": player.id, "score": 5000, "moves_used": 0}),
        ("/api/game/memory/submit", {"user_id": player.id, "pairs": 50, "moves": 1}),
    ]
    for path, body in forged:
        assert player.post(path, json=body).status_code in (404, 405)
    assert total_score(player) == 0
    rows = db_query("SELECT count(*) AS n FROM game_sessions gs JOIN users u ON u.id = gs.user_id WHERE u.username = $1",
                    player.username)
    assert rows[0]["n"] == 0


def test_rush_never_repeats_a_word_within_a_run(player):
    rid = player.post("/api/games/rush/rounds").json()["round_id"]
    seen = [round_state(rid)["puzzle"]["word"]]
    for _ in range(12):
        player.post(f"/api/games/rush/rounds/{rid}/answer", json={"answer": seen[-1]})
        seen.append(round_state(rid)["puzzle"]["word"])
    assert len(set(seen)) == len(seen)
