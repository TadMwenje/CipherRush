"""Phase 3: content scale, economy caps and gating, mobile resilience
(retries, resume, token refresh) and the Daily Cipher."""
import collections
import math
import uuid

import pytest

from tests.conftest import backdate_round, db_query, round_state

import ciphers
import economy as eco
import match3_engine
from auth import REFRESH_COOKIE, SESSION_COOKIE
from content import (
    BINHEX_CHALLENGES,
    BINHEX_FORMATS,
    CIPHER_PHRASES,
    PHRASES,
    QUIZ_CATEGORIES,
    QUIZ_QUESTIONS,
    RUSH_WORDS,
    TRUE_FALSE_STATEMENTS,
    VIGENERE_KEYS,
)
from content.binhex import display, encode_byte


# --- content banks ------------------------------------------------------------------

def test_cipher_phrase_bank():
    assert len(PHRASES) >= 250
    assert len(set(PHRASES)) == len(PHRASES)
    for phrase in PHRASES:
        assert phrase == phrase.strip() and "  " not in phrase
        assert set(phrase) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZ "), phrase
    assert all(len(CIPHER_PHRASES[t]) >= 60 for t in (1, 2, 3))


def test_quiz_bank_has_40_unique_questions_per_category():
    assert QUIZ_CATEGORIES == list(QUIZ_QUESTIONS)
    all_questions = []
    for category, questions in QUIZ_QUESTIONS.items():
        assert len(questions) >= 40, category
        for q in questions:
            assert len(q["options"]) == 4 and len(set(q["options"])) == 4, q["question"]
            assert q["explanation"].strip() and q["difficulty"] in (1, 2, 3)
            all_questions.append(q["question"])
    assert len(all_questions) >= 200 and len(set(all_questions)) == len(all_questions)


def test_true_false_bank():
    statements = [s["statement"] for s in TRUE_FALSE_STATEMENTS]
    assert len(statements) >= 200 and len(set(statements)) == len(statements)
    assert all(s["explanation"].strip() and isinstance(s["answer"], bool) for s in TRUE_FALSE_STATEMENTS)
    for difficulty in (1, 2, 3):
        pool = [s for s in TRUE_FALSE_STATEMENTS if s["difficulty"] <= difficulty]
        assert sum(not s["answer"] for s in pool) >= 5, "need 5 false statements per round at every level"


def test_vigenere_key_tiers_grow_and_include_multiword_keys():
    lengths = {tier: {len(k.replace(" ", "")) for k in keys} for tier, keys in VIGENERE_KEYS.items()}
    assert max(lengths[1]) < min(lengths[2]) and max(lengths[3]) < min(lengths[4])
    assert all(" " in k for k in VIGENERE_KEYS[4])


def test_binhex_table_round_trips():
    assert len(BINHEX_CHALLENGES) == 50
    for word, fmt in BINHEX_CHALLENGES:
        _, _, base = BINHEX_FORMATS[fmt]
        codes = [encode_byte(ch, fmt) for ch in word]
        digits = [c.replace("0x", "").replace("\\x", "").replace("%", "").replace(" ", "") for c in codes]
        assert "".join(chr(int(d, base)) for d in digits) == word
        assert display(word, fmt)
    assert encode_byte("K", "bin8") == "01001011" and encode_byte("K", "bin7") == "1001011"
    assert display("KEY", "url") == "%4B%45%59"


def test_rush_words_are_real_and_sized():
    for length, words in RUSH_WORDS.items():
        assert all(len(w) == length and w.isalpha() for w in words)
        assert len(set(words)) == len(words)


# --- economy --------------------------------------------------------------------------

def test_tapered_multiplier_never_exceeds_its_ceiling_and_gains_shrink():
    values = [eco.tapered_multiplier(n, 0.5, 2.5) for n in range(1, 60)]
    assert values[0] == 1.0 and max(values) <= 2.5
    gains = [b - a for a, b in zip(values, values[1:])]
    assert all(g2 <= g1 + 0.011 for g1, g2 in zip(gains, gains[1:]))  # 2dp rounding jitter


def test_level_scaling_is_sublinear():
    assert eco.level_factor(1) == 1
    assert eco.level_factor(200) < 4  # level 200 pays less than 4x level 1


def test_cipher_max_score_fits_under_cap():
    from game_routes import score_cipher
    for level in (1, 10, 200):
        best, _, _ = score_cipher("vigenere", level, elapsed=0, time_limit=180, hints_used=0)
        assert best <= eco.round_cap("cipher", level)


def test_round_score_is_clamped_to_cap(player):
    rid = player.post("/api/games/match3/rounds").json()["round_id"]
    db_query("UPDATE game_rounds SET state = state || '{\"score\": 999999, \"moves_left\": 1}'::jsonb WHERE id = $1",
             uuid.UUID(rid))
    a, b = match3_engine.find_valid_move(round_state(rid)["board"])
    body = player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": list(a), "b": list(b)}).json()
    assert body["finished"] and body["result"]["score"] == eco.round_cap("match3", 1)


def test_failed_rounds_do_not_count_toward_level_up(player):
    rid = player.post("/api/games/quiz/rounds", json={"category": "phishing"}).json()["round_id"]
    wrong = [(item["correct"] + 1) % 4 for item in round_state(rid)["items"]]
    body = player.post(f"/api/games/quiz/rounds/{rid}/submit", json={"answers": wrong}).json()
    assert body["passed"] is False
    assert body["game_progress"]["completions_at_level"] == 0

    rid = player.post("/api/games/quiz/rounds", json={"category": "phishing"}).json()["round_id"]
    right = [item["correct"] for item in round_state(rid)["items"]]
    body = player.post(f"/api/games/quiz/rounds/{rid}/submit", json={"answers": right}).json()
    assert body["passed"] is True and body["game_progress"]["completions_at_level"] == 1


def test_true_false_rounds_are_half_true_half_false(player):
    for _ in range(3):
        rid = player.post("/api/games/truefalse/rounds").json()["round_id"]
        answers = [TRUE_FALSE_STATEMENTS[i]["answer"] for i in round_state(rid)["items"]]
        assert collections.Counter(answers) == {True: 5, False: 5}


# Fields each screen reads before it can draw anything. A start response missing
# one of these leaves the client on a loading state forever (the Phase 3
# Match-3 "freeze": the board wasn't in the start payload).
START_CONTRACT = {
    ("cipher", '{"variant": "caesar"}'): ["round_id", "ciphertext", "time_limit", "free_hint", "hints_available"],
    ("quiz", '{"category": "malware"}'): ["round_id", "category", "questions"],
    ("truefalse", None): ["round_id", "statements"],
    ("binhex", None): ["round_id", "items"],
    ("match3", None): ["round_id", "board", "board_size", "symbols", "target_score", "moves_allowed"],
    ("memory", None): ["round_id", "pairs", "card_count"],
    ("rush", None): ["round_id", "duration", "puzzle", "score", "combo", "next_points"],
}


@pytest.mark.parametrize("game,body", list(START_CONTRACT))
def test_start_response_has_everything_the_screen_needs(player, game, body):
    import json as _json
    data = player.post(f"/api/games/{game}/rounds", json=_json.loads(body) if body else None).json()
    missing = [k for k in START_CONTRACT[(game, body)] if data.get(k) in (None, "", [])]
    assert not missing, f"{game} start response missing {missing}"


def test_match3_start_board_is_a_playable_6x6(player):
    board = player.post("/api/games/match3/rounds").json()["board"]
    assert len(board) == 6 and all(len(row) == 6 for row in board)
    assert not match3_engine.find_matches(board) and match3_engine.find_valid_move(board)


def test_cascades_are_capped_and_reshuffle():
    # One symbol type: every refill matches again - this used to loop forever.
    out = match3_engine.resolve_swap([["lock"] * 6 for _ in range(6)], (0, 0), (0, 1), ["lock"], "s", 1)
    assert len(out["steps"]) == match3_engine.MAX_CASCADES and out["reshuffled"]


def test_board_generation_never_raises_or_hangs():
    import random
    for symbols in (["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d", "e", "f"]):
        board = match3_engine.generate_board(6, symbols, random.Random(0))
        assert len(board) == 6 and not match3_engine.find_matches(board)


# --- server-authoritative time -------------------------------------------------------

def test_time_endpoint_is_utc_and_current(client):
    import datetime as dt
    data = client.get("/api/time").json()
    now = dt.datetime.now(dt.timezone.utc)
    assert abs(data["epoch_ms"] / 1000 - now.timestamp()) < 5
    assert data["utc_day"] == now.date().isoformat()
    assert data["daily_resets_at"].startswith((now.date() + dt.timedelta(days=1)).isoformat())


def test_daily_day_ignores_client_clock(player):
    import datetime as dt
    spoof = {"Date": "Mon, 01 Jan 2001 00:00:00 GMT", "X-Client-Time": "2001-01-01T00:00:00Z"}
    data = player.post("/api/daily/start", headers=spoof).json()
    assert data["day"] == dt.datetime.now(dt.timezone.utc).date().isoformat()


def test_daily_submit_requires_the_recorded_attempt(player):
    rid = player.post("/api/daily/start").json()["round_id"]
    # Detach the attempt from this round (as if it were forged or replayed from another day).
    db_query("UPDATE daily_attempts SET round_id = gen_random_uuid() WHERE user_id = $1", uuid.UUID(player.id))
    res = player.post(f"/api/daily/rounds/{rid}/submit", json={"answer": round_state(rid)["plaintext"]})
    assert res.status_code == 409


# --- mobile resilience -------------------------------------------------------------------

def test_retried_swap_is_applied_once(player):
    rid = player.post("/api/games/match3/rounds").json()["round_id"]
    a, b = match3_engine.find_valid_move(round_state(rid)["board"])
    headers = {"X-Request-Id": "retry-me-1"}
    first = player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": list(a), "b": list(b)}, headers=headers)
    second = player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": list(a), "b": list(b)}, headers=headers)
    assert first.json() == second.json()
    assert round_state(rid)["move_no"] == 1


def test_retry_of_the_final_action_returns_the_result_not_409(player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    answer = round_state(rid)["plaintext"]
    headers = {"X-Request-Id": "final-answer"}
    first = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer}, headers=headers)
    retry = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer}, headers=headers)
    assert retry.status_code == 200 and retry.json() == first.json()
    fresh = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": answer},
                        headers={"X-Request-Id": "different"})
    assert fresh.status_code == 409
    assert db_query("SELECT count(*) AS n FROM game_sessions WHERE user_id = $1", uuid.UUID(player.id))[0]["n"] == 1


def test_resume_active_round_after_app_restart(player):
    assert player.get("/api/games/memory/rounds/active").json() == {"round": None}
    rid = player.post("/api/games/memory/rounds").json()["round_id"]
    player.post(f"/api/games/memory/rounds/{rid}/flip", json={"index": 0})
    resumed = player.get("/api/games/memory/rounds/active").json()["round"]
    assert resumed["round_id"] == rid and resumed["pending"] == 0
    assert resumed["revealed"] == {"0": round_state(rid)["deck"][0]}
    assert "deck" not in resumed  # the rest of the deck stays secret


def test_resume_hides_answers(player):
    rid = player.post("/api/games/cipher/rounds", json={"variant": "vigenere"}).json()["round_id"]
    state = round_state(rid)
    resumed = player.get("/api/games/cipher/rounds/active").json()["round"]
    assert resumed["round_id"] == rid
    assert state["plaintext"] not in str(resumed) and state["key"] not in str(resumed)


def test_refresh_rotates_and_detects_reuse(player):
    old_refresh = player.refresh_token
    res = player.post("/api/auth/refresh")
    assert res.status_code == 200 and player.refresh_token != old_refresh
    assert player.get("/api/auth/me").status_code == 200

    # The old token replayed within the grace window (parallel wake-up) still works...
    db_query("UPDATE refresh_tokens SET used_at = now() - interval '5 seconds' WHERE user_id = $1", uuid.UUID(player.id))
    stolen = player.refresh_token
    player.refresh_token = old_refresh
    assert player.post("/api/auth/refresh").status_code == 200

    # ...but a long-retired token coming back kills every session.
    db_query("UPDATE refresh_tokens SET used_at = now() - interval '10 minutes' WHERE user_id = $1", uuid.UUID(player.id))
    player.refresh_token = stolen
    assert player.post("/api/auth/refresh").status_code == 401
    assert player.get("/api/auth/me").status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(player):
    player.client.cookies.clear()
    player.client.cookies.set(SESSION_COOKIE, player.refresh_token, path="/api")
    assert player.client.get("/api/auth/me").status_code == 401


# --- daily cipher -----------------------------------------------------------------------

def test_daily_cipher_is_shared_single_attempt_and_ranked(make_player):
    alice, bob = make_player(), make_player()
    a = alice.post("/api/daily/start").json()
    b = bob.post("/api/daily/start").json()
    assert a["ciphertext"] == b["ciphertext"] and a["round_id"] != b["round_id"]
    assert "plaintext" not in a and "key" not in a and "shift" not in a

    again = alice.post("/api/daily/start").json()
    assert again["round_id"] == a["round_id"] and again["resumed"]

    answer = round_state(a["round_id"])["plaintext"]
    body = alice.post(f"/api/daily/rounds/{a['round_id']}/submit", json={"answer": answer}).json()
    assert body["correct"] and body["streak"] == 1 and body["game_progress"] is None
    assert body["score"] <= eco.round_cap("daily", 1)

    assert alice.post("/api/daily/start").status_code == 409
    status = alice.get("/api/daily").json()
    assert status["played"] and status["solved"] and status["streak"] == 1
    board = alice.get("/api/leaderboard/daily").json()["leaderboard"]
    assert any(r["username"] == alice.username for r in board)


def test_daily_does_not_touch_level_tracks(player):
    rid = player.post("/api/daily/start").json()["round_id"]
    player.post(f"/api/daily/rounds/{rid}/submit", json={"answer": round_state(rid)["plaintext"]})
    rows = db_query("SELECT count(*) AS n FROM game_progress WHERE user_id = $1", uuid.UUID(player.id))
    assert rows[0]["n"] == 0
