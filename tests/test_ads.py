"""Rewarded ads, verified server-side (backend/ads.py)."""
import base64
import uuid
from urllib.parse import quote

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

import ads
from game_routes import score_cipher
from tests.conftest import backdate_round, db_query, round_state

KEY_ID = 3335741209
_google_key = ec.generate_private_key(ec.SECP256R1())
_impostor_key = ec.generate_private_key(ec.SECP256R1())
ANDROID_REWARDED = "ca-app-pub-4454014752754466/1864983028"
ANDROID_REWARDED_INTERSTITIAL = "ca-app-pub-4454014752754466/9823364092"


@pytest.fixture(autouse=True)
def google_keys(monkeypatch):
    async def key(key_id):
        return _google_key.public_key() if key_id == KEY_ID else None
    monkeypatch.setattr(ads, "verifier_key", key)


def ssv(client, reward_id, user_id, ad_unit=ANDROID_REWARDED, transaction_id=None, signer=None):
    """Send a callback the way Google does: signed parameters, then signature and key_id."""
    params = [
        ("ad_network", "5450213213286189855"),
        ("ad_unit", ad_unit.rsplit("/", 1)[-1]),
        ("custom_data", reward_id),
        ("reward_amount", "1"),
        ("reward_item", "Reward"),
        ("timestamp", "1793199999999"),
        ("transaction_id", transaction_id or uuid.uuid4().hex),
        ("user_id", user_id),
    ]
    message = "&".join(f"{k}={quote(v, safe='')}" for k, v in params)
    signature = (signer or _google_key).sign(message.encode(), ec.ECDSA(hashes.SHA256()))
    query = f"{message}&signature={base64.urlsafe_b64encode(signature).decode().rstrip('=')}&key_id={KEY_ID}"
    return client.get(f"/api/ads/ssv?{query}")


def reward(player, kind, round_id=None):
    res = player.post("/api/ads/rewards", json={"kind": kind, "round_id": round_id})
    assert res.status_code == 200, res.text
    return res.json()["reward_id"]


def status(player, reward_id):
    return player.get(f"/api/ads/rewards/{reward_id}").json()["status"]


def earned(player, client, kind, round_id=None, ad_unit=ANDROID_REWARDED):
    rid = reward(player, kind, round_id)
    assert ssv(client, rid, player.id, ad_unit).status_code == 200
    assert status(player, rid) == "earned"
    return rid


# --- SSV callback ---------------------------------------------------------------------

def test_only_a_correctly_signed_callback_earns_the_reward(client, player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    reward_id = reward(player, "hint", rid)
    assert status(player, reward_id) == "pending"
    assert ssv(client, reward_id, player.id, signer=_impostor_key).status_code == 400
    assert status(player, reward_id) == "pending"
    assert ssv(client, reward_id, player.id).status_code == 200
    assert status(player, reward_id) == "earned"


def test_callback_must_match_the_player_and_the_ad_unit(client, player, make_player):
    other = make_player()
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    reward_id = reward(player, "hint", rid)
    ssv(client, reward_id, other.id)
    ssv(client, reward_id, player.id, ad_unit=ANDROID_REWARDED_INTERSTITIAL)
    assert status(player, reward_id) == "pending"


def test_one_ad_view_pays_out_once(client, player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    first, second = reward(player, "hint", rid), reward(player, "hint", rid)
    ssv(client, first, player.id, transaction_id="txn-replayed")
    ssv(client, second, player.id, transaction_id="txn-replayed")
    assert status(player, first) == "earned" and status(player, second) == "pending"


def test_unsigned_or_tampered_callbacks_are_refused(client, player):
    assert client.get("/api/ads/ssv?custom_data=x&user_id=y").status_code == 400
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    reward_id = reward(player, "hint", rid)
    res = ssv(client, reward_id, player.id)
    assert res.status_code == 200
    # Flip a signed field after signing: the signature no longer holds.
    reward_id2 = reward(player, "hint", rid)
    params = f"ad_unit=1864983028&custom_data={reward_id2}&transaction_id=t1&user_id={player.id}"
    sig = base64.urlsafe_b64encode(_google_key.sign(params.encode(), ec.ECDSA(hashes.SHA256()))).decode()
    tampered = params.replace("t1", "t2")
    assert client.get(f"/api/ads/ssv?{tampered}&signature={sig}&key_id={KEY_ID}").status_code == 400


def test_reward_status_is_private(client, player, make_player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    reward_id = reward(player, "hint", rid)
    assert make_player().get(f"/api/ads/rewards/{reward_id}").status_code == 404


def test_round_rewards_need_the_players_own_live_round(player, make_player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    assert make_player().post("/api/ads/rewards", json={"kind": "hint", "round_id": rid}).status_code == 404
    assert player.post("/api/ads/rewards", json={"kind": "continue", "round_id": rid}).status_code == 404


# --- cipher hint ---------------------------------------------------------------------

def test_a_watched_ad_pays_for_a_hint_instead_of_points(client, player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    reward_id = earned(player, client, "hint", rid)
    res = player.post(f"/api/games/cipher/rounds/{rid}/hint", json={"reward_id": reward_id})
    assert res.status_code == 200, res.text
    # Spent: the same reward can't buy a second hint.
    assert player.post(f"/api/games/cipher/rounds/{rid}/hint", json={"reward_id": reward_id}).status_code == 402

    state = round_state(rid)
    done = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": state["plaintext"]}).json()
    assert done["correct"] and done["hint_penalty"] == 0


def test_an_unwatched_ad_buys_nothing(player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    pending = reward(player, "hint", rid)
    res = player.post(f"/api/games/cipher/rounds/{rid}/hint", json={"reward_id": pending})
    assert res.status_code == 402
    assert round_state(rid)["hints_used"] == 0


def test_paid_hints_still_cost_points(player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    assert player.post(f"/api/games/cipher/rounds/{rid}/hint").status_code == 200
    state = round_state(rid)
    done = player.post(f"/api/games/cipher/rounds/{rid}/submit", json={"answer": state["plaintext"]}).json()
    assert done["hint_penalty"] > 0


# --- match-3 continue ----------------------------------------------------------------

def last_move_round(player):
    """A Match-3 round one move from running out, with an unreachable target."""
    rid = player.post("/api/games/match3/rounds").json()["round_id"]
    db_query(
        """UPDATE game_rounds SET state = jsonb_set(jsonb_set(state, '{moves_left}', '1'), '{target}', '999999')
           WHERE id = $1::uuid""",
        rid,
    )
    return rid


def play_last_move(player, rid, can_continue=True):
    import match3_engine
    a, b = match3_engine.find_valid_move(round_state(rid)["board"])
    return player.post(f"/api/games/match3/rounds/{rid}/swap",
                       json={"a": list(a), "b": list(b), "can_continue": can_continue}).json()


def test_out_of_moves_waits_for_the_players_choice(client, player):
    rid = last_move_round(player)
    body = play_last_move(player, rid)
    assert body["out_of_moves"] and not body["finished"] and body["continue_moves"] == 5
    assert player.get("/api/games/match3/rounds/active").json()["round"]["out_of_moves"] is True

    reward_id = earned(player, client, "continue", rid)
    res = player.post(f"/api/games/match3/rounds/{rid}/continue", json={"reward_id": reward_id})
    assert res.status_code == 200 and res.json()["moves_left"] == 5
    # Once per round: running out again ends it.
    db_query("UPDATE game_rounds SET state = jsonb_set(state, '{moves_left}', '1') WHERE id = $1::uuid", rid)
    assert play_last_move(player, rid)["finished"] is True


def test_declining_the_extra_moves_ends_the_round(player):
    rid = last_move_round(player)
    play_last_move(player, rid)
    res = player.post(f"/api/games/match3/rounds/{rid}/finish")
    assert res.status_code == 200 and res.json()["result"]["won"] is False


def test_continue_needs_a_verified_reward(player):
    rid = last_move_round(player)
    play_last_move(player, rid)
    pending = reward(player, "continue", rid)
    assert player.post(f"/api/games/match3/rounds/{rid}/continue", json={"reward_id": pending}).status_code == 402
    assert player.post(f"/api/games/match3/rounds/{rid}/swap", json={"a": [0, 0], "b": [0, 1]}).status_code == 409


def test_clients_without_ads_finish_as_before(player):
    rid = last_move_round(player)
    assert play_last_move(player, rid, can_continue=False)["finished"] is True


# --- double-points boost --------------------------------------------------------------

def test_a_boost_doubles_the_next_scored_round(client, player):
    earned(player, client, "boost", ad_unit=ANDROID_REWARDED_INTERSTITIAL)
    start = player.post("/api/games/cipher/rounds", json={}).json()
    assert start["boosted"] is True
    state = round_state(start["round_id"])
    backdate_round(start["round_id"], state["time_limit"])  # no time bonus: a fixed score
    done = player.post(f"/api/games/cipher/rounds/{start['round_id']}/submit",
                       json={"answer": state["plaintext"]}).json()
    base, _, _ = score_cipher(state["variant"], start["level"], state["time_limit"], state["time_limit"], 0)
    assert done["boosted"] is True and done["score"] == 2 * base
    # Used up: the round after is normal.
    assert "boosted" not in player.post("/api/games/cipher/rounds", json={}).json()


def test_boosts_skip_rush_and_wait_for_an_eligible_round(client, player):
    earned(player, client, "boost", ad_unit=ANDROID_REWARDED_INTERSTITIAL)
    assert "boosted" not in player.post("/api/games/rush/rounds").json()
    assert player.post("/api/games/match3/rounds").json()["boosted"] is True


def test_three_boosts_a_day(client, player):
    for _ in range(ads.BOOSTS_PER_DAY):
        earned(player, client, "boost", ad_unit=ANDROID_REWARDED_INTERSTITIAL)
    res = player.post("/api/ads/rewards", json={"kind": "boost"})
    assert res.status_code == 429


def test_time_spent_on_a_hint_video_goes_back_on_the_clock(client, player):
    rid = player.post("/api/games/cipher/rounds", json={}).json()["round_id"]
    limit = round_state(rid)["time_limit"]
    reward_id = earned(player, client, "hint", rid)
    db_query("UPDATE ad_rewards SET created_at = created_at - interval '30 seconds' WHERE id = $1::uuid", reward_id)
    res = player.post(f"/api/games/cipher/rounds/{rid}/hint", json={"reward_id": reward_id}).json()
    assert 30 <= res["time_added"] <= 32
    assert round_state(rid)["time_limit"] == limit + res["time_added"]
