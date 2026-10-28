"""Ad rewards, verified on the server.

Scores are server-authoritative, so a client saying "I watched the ad" is never
enough. Every reward goes through AdMob server-side verification (SSV):

  1. The app asks for a reward slot: POST /api/ads/rewards {kind, round_id}.
     The server records it as pending and returns its id.
  2. The app shows the rewarded ad with ssv.customData = that id and
     ssv.userId = the player's id.
  3. When the ad is watched, Google calls GET /api/ads/ssv with a signed query
     string. We check the ECDSA signature against Google's published keys, the
     ad unit, the player and the one-time transaction id, then mark it earned.
  4. The app polls GET /api/ads/rewards/{id} until it's earned, then spends it:
     a free cipher hint, +5 Match-3 moves, or double points on the next round.
     Each earned reward is spent exactly once, by its owner.

Kinds:
  * hint     - a Cipher Puzzles hint without the point cost (bound to a round)
  * continue - +5 moves on a Match-3 round that ran out (bound to a round)
  * boost    - double points on the next scored round (not Rush or Daily),
               at most BOOSTS_PER_DAY a day
"""
import base64
import logging
import time
import uuid
from typing import Dict, Literal, Optional
from urllib.parse import parse_qs

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from auth import get_current_user
from db import get_pool
from ratelimit import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

VERIFIER_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json"
KEY_CACHE_SECONDS = 24 * 60 * 60
PENDING_MINUTES = 15
EARNED_VALID_MINUTES = {"hint": 30, "continue": 30, "boost": 60}
BOOSTS_PER_DAY = 3
MATCH3_CONTINUE_MOVES = 5
# Time spent watching a hint video is given back to the cipher clock, up to this.
MAX_AD_SECONDS = 90
# Modes a boost can apply to: not Rush (best single run is its own leaderboard)
# and not the Daily Cipher (one shared attempt a day).
BOOSTABLE_GAMES = {"cipher", "quiz", "truefalse", "binhex", "match3", "memory"}

# AdMob ad unit ids (the part after "/"), per reward kind. Android then iOS.
REWARDED_UNITS = {"1864983028", "1344227940"}
REWARDED_INTERSTITIAL_UNITS = {"9823364092", "9031146273"}
UNITS_FOR_KIND = {"hint": REWARDED_UNITS, "continue": REWARDED_UNITS, "boost": REWARDED_INTERSTITIAL_UNITS}

_keys: Dict[int, ec.EllipticCurvePublicKey] = {}
_keys_fetched_at = 0.0


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RewardRequest(StrictModel):
    kind: Literal["hint", "continue", "boost"]
    round_id: Optional[str] = None


# --- Google's signing keys ----------------------------------------------------------

async def _fetch_keys() -> Dict[int, ec.EllipticCurvePublicKey]:
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(VERIFIER_KEYS_URL)
        res.raise_for_status()
    keys = {}
    for entry in res.json().get("keys", []):
        keys[int(entry["keyId"])] = serialization.load_pem_public_key(entry["pem"].encode("ascii"))
    return keys


async def verifier_key(key_id: int) -> Optional[ec.EllipticCurvePublicKey]:
    """Cached for a day; refetched early if Google has rotated to a key we haven't seen."""
    global _keys, _keys_fetched_at
    stale = time.time() - _keys_fetched_at > KEY_CACHE_SECONDS
    if stale or key_id not in _keys:
        try:
            _keys = await _fetch_keys()
            _keys_fetched_at = time.time()
        except Exception:  # noqa: BLE001 - keep the old keys; the callback is retried by Google
            logger.exception("Couldn't fetch AdMob verifier keys")
    return _keys.get(key_id)


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


async def verify_ssv_query(raw_query: str) -> Dict[str, str]:
    """Check an SSV callback's signature. Returns its parameters, or raises 400.

    Google signs every parameter before `signature` and `key_id`, which always
    come last, exactly as they appear in the query string."""
    marker = "&signature="
    cut = raw_query.find(marker)
    if cut < 0:
        raise HTTPException(status_code=400, detail="Unsigned callback")
    message = raw_query[:cut].encode("utf-8")
    params = {k: v[0] for k, v in parse_qs(raw_query, keep_blank_values=True).items()}
    try:
        key_id = int(params["key_id"])
        signature = _b64url_decode(params["signature"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Malformed callback")
    key = await verifier_key(key_id)
    if key is None:
        raise HTTPException(status_code=400, detail="Unknown signing key")
    try:
        key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
    except InvalidSignature:
        raise HTTPException(status_code=400, detail="Bad signature")
    return params


# --- endpoints -----------------------------------------------------------------------

def _parse_uuid(value: Optional[str]) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(value) if value else None
    except ValueError:
        return None


@router.post("/ads/rewards")
@limiter.limit("20/minute")
async def request_reward(request: Request, body: RewardRequest, user=Depends(get_current_user)):
    round_id = _parse_uuid(body.round_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        if body.kind in ("hint", "continue"):
            game_type = "cipher" if body.kind == "hint" else "match3"
            live = round_id and await conn.fetchval(
                """SELECT 1 FROM game_rounds WHERE id = $1 AND user_id = $2 AND game_type = $3
                   AND completed_at IS NULL AND expires_at > now()""",
                round_id, user["id"], game_type,
            )
            if not live:
                raise HTTPException(status_code=404, detail="That round has finished.")
        else:
            round_id = None
            today = await conn.fetchval(
                """SELECT count(*) FROM ad_rewards WHERE user_id = $1 AND kind = 'boost'
                   AND status IN ('earned', 'used') AND earned_at >= date_trunc('day', now())""",
                user["id"],
            )
            if today >= BOOSTS_PER_DAY:
                raise HTTPException(status_code=429, detail="That's today's double-points boosts used. More tomorrow.")
        await conn.execute(
            "DELETE FROM ad_rewards WHERE user_id = $1 AND status = 'pending' AND expires_at < now()", user["id"]
        )
        reward_id = await conn.fetchval(
            """INSERT INTO ad_rewards (user_id, kind, round_id, expires_at)
               VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id""",
            user["id"], body.kind, round_id, PENDING_MINUTES,
        )
    return {"reward_id": str(reward_id), "user_id": str(user["id"])}


@router.get("/ads/rewards/{reward_id}")
@limiter.limit("60/minute")
async def reward_status(request: Request, reward_id: str, user=Depends(get_current_user)):
    rid = _parse_uuid(reward_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        status = rid and await conn.fetchval(
            "SELECT status FROM ad_rewards WHERE id = $1 AND user_id = $2", rid, user["id"]
        )
    if not status:
        raise HTTPException(status_code=404, detail="Reward not found")
    return {"status": status}


@router.get("/ads/ssv", include_in_schema=False)
@limiter.limit("120/minute")
async def ssv_callback(request: Request):
    """Called by Google's servers, never by the app. 200 tells Google to stop retrying."""
    params = await verify_ssv_query(request.url.query)
    reward_id = _parse_uuid(params.get("custom_data"))
    unit = params.get("ad_unit", "").rsplit("/", 1)[-1]
    transaction_id = params.get("transaction_id", "")
    if not reward_id or not transaction_id:
        logger.warning("SSV callback without our reward id or a transaction id")
        return {"ok": False}
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            reward = await conn.fetchrow("SELECT * FROM ad_rewards WHERE id = $1 FOR UPDATE", reward_id)
            if not reward:
                return {"ok": False}
            if reward["status"] != "pending":
                return {"ok": True}  # Google retried an earlier delivery
            if params.get("user_id") != str(reward["user_id"]) or unit not in UNITS_FOR_KIND[reward["kind"]]:
                logger.warning("SSV callback for reward %s didn't match its player or ad unit", reward_id)
                return {"ok": False}
            if await conn.fetchval("SELECT 1 FROM ad_rewards WHERE transaction_id = $1", transaction_id):
                return {"ok": True}
            await conn.execute(
                """UPDATE ad_rewards SET status = 'earned', transaction_id = $2, earned_at = now(),
                   expires_at = now() + make_interval(mins => $3) WHERE id = $1""",
                reward_id, transaction_id, EARNED_VALID_MINUTES[reward["kind"]],
            )
    return {"ok": True}


# --- spending rewards (called from game routes, inside their transaction) -------------

async def spend_reward(conn, user_id: uuid.UUID, reward_id: Optional[str], kind: str, round_id: uuid.UUID) -> int:
    """Mark an earned round-bound reward used, or raise 402 if there isn't one.
    Returns roughly how many seconds the player spent on the video (capped)."""
    rid = _parse_uuid(reward_id)
    seconds = rid and await conn.fetchval(
        """UPDATE ad_rewards SET status = 'used', used_at = now()
           WHERE id = $1 AND user_id = $2 AND kind = $3 AND round_id = $4
             AND status = 'earned' AND expires_at > now()
           RETURNING LEAST($5, CEIL(EXTRACT(EPOCH FROM now() - created_at)))::int""",
        rid, user_id, kind, round_id, MAX_AD_SECONDS,
    )
    if seconds is None or seconds is False:
        raise HTTPException(status_code=402, detail="The video didn't finish, so there's no reward yet.")
    return seconds


async def take_boost(conn, user_id: uuid.UUID, game_type: str) -> bool:
    """Use the player's oldest earned boost on a round that's starting now."""
    if game_type not in BOOSTABLE_GAMES:
        return False
    used = await conn.fetchval(
        """UPDATE ad_rewards SET status = 'used', used_at = now()
           WHERE id = (SELECT id FROM ad_rewards WHERE user_id = $1 AND kind = 'boost'
                       AND status = 'earned' AND expires_at > now()
                       ORDER BY earned_at LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id""",
        user_id,
    )
    return used is not None
