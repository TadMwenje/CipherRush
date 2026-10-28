"""The Daily Cipher: one puzzle per UTC day, the same for every player.

The puzzle is derived from an HMAC of the date with a server secret, so it's
fixed for everyone that day but can't be precomputed from the date alone.
Rewards are flat (not level-scaled) and the mode has no level track, so a
daily habit adds a steady trickle rather than bending the main economy.
"""
import hashlib
import hmac
import os
import random
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

import ciphers
import economy as eco
from auth import _secret, get_current_user
from content import CIPHER_PHRASES
from db import get_pool
from game_routes import CipherAnswer, build_cipher_puzzle, cipher_reveal
from ratelimit import limiter
from rounds import complete_round, create_round, elapsed_seconds, is_expired, run_locked

router = APIRouter(prefix="/api")

# Monday first. Vigenere on the days people have more time.
WEEKDAY_VARIANTS = ["caesar", "vigenere", "atbash", "caesar", "vigenere", "caesar", "vigenere"]


def today_utc() -> date:
    """The only clock that decides which day it is. Client clocks are never consulted."""
    return datetime.now(timezone.utc).date()


def next_reset(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), datetime.min.time(), timezone.utc)


@router.get("/time")
async def server_time():
    """Authoritative clock for the app. Phones sync to this on launch so countdowns
    and the daily rollover don't depend on (or care about) the device's clock."""
    now = datetime.now(timezone.utc)
    return {
        "epoch_ms": int(now.timestamp() * 1000),
        "iso": now.isoformat(),
        "utc_day": now.date().isoformat(),
        "daily_resets_at": next_reset(now.date()).isoformat(),
    }


def _seed(day: date) -> str:
    key = (os.environ.get("DAILY_SEED_SECRET") or _secret()).encode()
    return hmac.new(key, f"cipherrush-daily:{day.isoformat()}".encode(), hashlib.sha256).hexdigest()


def daily_puzzle(day: date):
    """Deterministic (secret, public) puzzle for a given day."""
    rng = random.Random(_seed(day))
    variant = WEEKDAY_VARIANTS[day.weekday()]
    plaintext = rng.choice(CIPHER_PHRASES[2] + CIPHER_PHRASES[3])
    secret, public = build_cipher_puzzle(variant, plaintext, rng, key_tier=2)
    secret["time_limit"] = eco.DAILY_TIME_LIMIT
    public.update({"day": day.isoformat(), "time_limit": eco.DAILY_TIME_LIMIT})
    return secret, public


async def _streak(conn, user_id, day: date) -> int:
    """Consecutive solved days ending on `day` (or the day before, if today isn't solved yet)."""
    rows = await conn.fetch(
        "SELECT day FROM daily_attempts WHERE user_id = $1 AND solved ORDER BY day DESC LIMIT 400", user_id
    )
    solved = {r["day"] for r in rows}
    cursor = day if day in solved else day - timedelta(days=1)
    streak = 0
    while cursor in solved:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _time_up(row) -> bool:
    return is_expired(row) or elapsed_seconds(row) > row["state"]["time_limit"] + 5


@router.get("/daily")
async def daily_status(user=Depends(get_current_user)):
    day = today_utc()
    pool = await get_pool()
    async with pool.acquire() as conn:
        attempt = await conn.fetchrow(
            "SELECT * FROM daily_attempts WHERE user_id = $1 AND day = $2", user["id"], day
        )
        streak = await _streak(conn, user["id"], day)
        solvers = await conn.fetchval("SELECT count(*) FROM daily_attempts WHERE day = $1 AND solved", day)
        open_round = None
        if attempt:
            row = await conn.fetchrow(
                "SELECT * FROM game_rounds WHERE id = $1 AND completed_at IS NULL", attempt["round_id"]
            )
            if row and not _time_up(row):
                open_round = {"round_id": str(row["id"]), **row["state"]["public"],
                              "time_left": max(0, int(row["state"]["time_limit"] - elapsed_seconds(row)))}
    _, public = daily_puzzle(day)
    return {
        "day": day.isoformat(),
        "variant": public["variant"],
        "played": bool(attempt) and open_round is None,
        "solved": bool(attempt and attempt["solved"]),
        "score": attempt["score"] if attempt else 0,
        "seconds": attempt["seconds"] if attempt else None,
        "streak": streak,
        "solvers_today": solvers,
        "round": open_round,
        "resets_at": next_reset(day).isoformat(),
    }


@router.post("/daily/start")
@limiter.limit("10/minute")
async def daily_start(request: Request, user=Depends(get_current_user)):
    day = today_utc()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            attempt = await conn.fetchrow(
                "SELECT * FROM daily_attempts WHERE user_id = $1 AND day = $2 FOR UPDATE", user["id"], day
            )
            if attempt:
                row = await conn.fetchrow(
                    "SELECT * FROM game_rounds WHERE id = $1 AND completed_at IS NULL", attempt["round_id"]
                )
                if row and not _time_up(row):
                    return {"round_id": str(row["id"]), "resumed": True, **row["state"]["public"],
                            "time_left": max(0, int(row["state"]["time_limit"] - elapsed_seconds(row)))}
                raise HTTPException(status_code=409, detail="You've had today's shot. New cipher at midnight UTC.")
            secret, public = daily_puzzle(day)
            secret["public"] = public
            round_id = await create_round(conn, user["id"], "daily", 1, secret, eco.DAILY_TIME_LIMIT + 60)
            await conn.execute(
                "INSERT INTO daily_attempts (user_id, day, round_id) VALUES ($1, $2, $3)", user["id"], day, round_id
            )
    return {"round_id": str(round_id), "time_left": eco.DAILY_TIME_LIMIT, **public}


@router.post("/daily/rounds/{round_id}/submit")
@limiter.limit("30/minute")
async def daily_submit(request: Request, round_id: str, body: CipherAnswer, user=Depends(get_current_user)):
    async def handler(conn, row):
        state = row["state"]
        day = date.fromisoformat(state["public"]["day"])
        # The round must be the one recorded as this player's attempt for that day.
        attempt = await conn.fetchrow(
            "SELECT 1 FROM daily_attempts WHERE user_id = $1 AND day = $2 AND round_id = $3",
            user["id"], day, row["id"],
        )
        if not attempt:
            raise HTTPException(status_code=409, detail="That round isn't today's attempt.")
        elapsed = elapsed_seconds(row)
        timed_out = _time_up(row)
        correct = (not timed_out) and ciphers.normalize_answer(body.answer) == state["plaintext"]
        seconds = int(round(min(elapsed, state["time_limit"])))

        if not correct:
            await conn.execute("UPDATE game_rounds SET completed_at = now() WHERE id = $1", row["id"])
            await conn.execute(
                "UPDATE daily_attempts SET seconds = $3 WHERE user_id = $1 AND day = $2", user["id"], day, seconds
            )
            return {"correct": False, "timed_out": timed_out, **cipher_reveal(state), "score": 0,
                    "streak": await _streak(conn, user["id"], day), "new_achievements": [],
                    "game_progress": None, "overall_level_up": None}

        await conn.execute(
            "UPDATE daily_attempts SET solved = TRUE, seconds = $3 WHERE user_id = $1 AND day = $2",
            user["id"], day, seconds,
        )
        streak = await _streak(conn, user["id"], day)
        remaining = max(0.0, state["time_limit"] - elapsed) / state["time_limit"]
        time_bonus = int(eco.DAILY_TIME_BONUS_MAX * remaining)
        streak_bonus = min(eco.DAILY_STREAK_BONUS_CAP, eco.DAILY_STREAK_BONUS_PER_DAY * max(0, streak - 1))
        score = eco.DAILY_BASE + time_bonus + streak_bonus
        result = await complete_round(conn, user["id"], row, score, ["daily_driver"] if streak >= 7 else [],
                                      puzzle_solved=True, track_progress=False)
        await conn.execute(
            "UPDATE daily_attempts SET score = $3 WHERE user_id = $1 AND day = $2", user["id"], day, result["score"]
        )
        return {"correct": True, "timed_out": False, **cipher_reveal(state), "seconds": seconds,
                "time_bonus": time_bonus, "streak_bonus": streak_bonus, "streak": streak, **result}

    return await run_locked(await get_pool(), request, round_id, user["id"], "daily", handler)


@router.get("/leaderboard/daily")
async def daily_leaderboard():
    """Today's solvers, fastest first."""
    day = today_utc()
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT u.username, d.seconds, d.score FROM daily_attempts d JOIN users u ON u.id = d.user_id
               WHERE d.day = $1 AND d.solved AND NOT u.is_review_account ORDER BY d.seconds ASC, d.score DESC LIMIT 10""",
            day,
        )
    return {"day": day.isoformat(), "leaderboard": [
        {"rank": i + 1, "username": r["username"], "seconds": r["seconds"], "score": r["score"]}
        for i, r in enumerate(rows)
    ]}
