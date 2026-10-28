"""Game round lifecycle and progression (XP, levels, achievements).

A round is created server-side with its secret state, mutated only through
validated actions, and completed exactly once - completion is the single
place score, XP and achievements are granted.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg
from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder

from economy import round_cap

from leveling import (
    MAX_LEVEL,
    MIN_COMPLETIONS_TO_LEVEL_UP,
    CROSS_GAME_GATE_LEVEL,
    MIN_OTHER_GAMES_ENGAGED,
    compute_level,
    xp_required_for_next_level,
)

logger = logging.getLogger(__name__)

# Modes with their own level track. The Daily Cipher deliberately isn't one.
GAME_TYPES = ["cipher", "quiz", "match3", "memory", "truefalse", "binhex", "rush"]
REQUEST_ID_HEADER = "X-Request-Id"

ACHIEVEMENTS = {
    "first_steps": ("First Steps", "Completed your first CipherRush challenge"),
    "first_decrypt": ("First Decrypt", "Solved your first cipher puzzle"),
    "cipher_novice": ("Cipher Novice", "Solved 5 cipher puzzles"),
    "codebreaker": ("Codebreaker", "Cracked a Vigenere cipher"),
    "quiz_whiz": ("Quiz Whiz", "Scored a perfect 100% on a security quiz"),
    "match_master": ("Match Master", "Scored 1,000+ points in a single Match-3 Security round"),
    "memory_master": ("Memory Master", "Completed Memory Lock with a perfect, mistake-free run"),
    "memory_maestro": ("Memory Maestro", "Completed a Memory Lock board with at most 2 misses"),
    "fact_checker": ("Fact Checker", "Answered every True or False statement correctly"),
    "binary_boss": ("Binary Boss", "Decoded every word in a Binary/Hex Decoder round"),
    "rush_hour": ("Rush Hour", "Cracked 20 words in a single Speed Cipher Rush"),
    "daily_driver": ("Daily Driver", "Cracked the Daily Cipher seven days running"),
    "security_sentinel": ("Security Sentinel", "Played every CipherRush game mode"),
    "high_scorer": ("High Scorer", "Reached the top 10 on the global leaderboard"),
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def elapsed_seconds(round_row) -> float:
    return (utcnow() - round_row["started_at"]).total_seconds()


def is_expired(round_row) -> bool:
    return utcnow() >= round_row["expires_at"]


def parse_round_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="Round not found")


async def get_game_level(conn, user_id: uuid.UUID, game_type: str) -> int:
    level = await conn.fetchval(
        "SELECT level FROM game_progress WHERE user_id = $1 AND game_type = $2", user_id, game_type
    )
    return level or 1


async def create_round(conn, user_id: uuid.UUID, game_type: str, level: int, state: Dict[str, Any],
                       ttl_seconds: int) -> uuid.UUID:
    # Housekeeping: drop this user's stale rounds so the table doesn't grow unbounded.
    await conn.execute(
        "DELETE FROM game_rounds WHERE user_id = $1 AND started_at < now() - interval '1 day'",
        user_id,
    )
    return await conn.fetchval(
        """
        INSERT INTO game_rounds (user_id, game_type, level, state, expires_at)
        VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))
        RETURNING id
        """,
        user_id, game_type, level, state, float(ttl_seconds),
    )


async def lock_round(conn, round_id: str, user_id: uuid.UUID, game_type: str):
    """Row-lock a round owned by this user (must be called inside a transaction)."""
    row = await conn.fetchrow(
        "SELECT * FROM game_rounds WHERE id = $1 AND user_id = $2 AND game_type = $3 FOR UPDATE",
        parse_round_id(round_id), user_id, game_type,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Round not found")
    return row


async def save_state(conn, round_id: uuid.UUID, state: Dict[str, Any]) -> None:
    await conn.execute("UPDATE game_rounds SET state = $2 WHERE id = $1", round_id, state)


# --- progression -----------------------------------------------------------------

async def award_achievement(conn, user_id: uuid.UUID, key: str) -> bool:
    badge_name, description = ACHIEVEMENTS[key]
    if await conn.fetchval(
        "SELECT 1 FROM achievements WHERE user_id = $1 AND badge_name = $2", user_id, badge_name
    ):
        return False
    await conn.execute(
        "INSERT INTO achievements (user_id, badge_name, description) VALUES ($1, $2, $3)",
        user_id, badge_name, description,
    )
    await conn.execute(
        "UPDATE users SET badges = array_append(badges, $2) WHERE id = $1 AND NOT ($2 = ANY(badges))",
        user_id, badge_name,
    )
    return True


def achievement_payload(keys: List[str]) -> List[Dict[str, str]]:
    return [{"key": k, "badge_name": ACHIEVEMENTS[k][0], "description": ACHIEVEMENTS[k][1]} for k in keys]


async def count_other_games_played(conn, user_id: uuid.UUID, game_type: str) -> int:
    count = await conn.fetchval(
        "SELECT count(DISTINCT game_type) FROM game_sessions WHERE user_id = $1 AND game_type != $2",
        user_id, game_type,
    )
    return count or 0


async def update_overall_level(conn, user_id: uuid.UUID) -> Optional[int]:
    """Account level is purely a function of cumulative total_score."""
    row = await conn.fetchrow("SELECT level, total_score FROM users WHERE id = $1", user_id)
    if not row:
        return None
    new_level = compute_level(row["total_score"])
    if new_level != row["level"]:
        await conn.execute("UPDATE users SET level = $1 WHERE id = $2", new_level, user_id)
        return new_level
    return None


async def update_game_progress(conn, user_id: uuid.UUID, game_type: str, xp_earned: int,
                               passed: bool = True) -> Dict[str, Any]:
    """Add XP to this game's own track; level up once the XP, cleared-round and
    cross-game gates are all satisfied (at most one level per round). Only
    cleared rounds count toward the completions gate, so losing rounds can't
    be farmed for progress."""
    cleared = 1 if passed else 0
    row = await conn.fetchrow(
        """
        INSERT INTO game_progress (user_id, game_type, xp, completions_at_level)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, game_type) DO UPDATE
        SET xp = game_progress.xp + $3,
            completions_at_level = game_progress.completions_at_level + $4,
            updated_at = now()
        RETURNING level, xp, completions_at_level
        """,
        user_id, game_type, max(xp_earned, 0), cleared,
    )
    level, xp, completions = row["level"], row["xp"], row["completions_at_level"]
    leveled_up = False

    gate_active = CROSS_GAME_GATE_LEVEL <= level < MAX_LEVEL
    other_games = await count_other_games_played(conn, user_id, game_type) if gate_active else None

    if level < MAX_LEVEL:
        threshold = xp_required_for_next_level(level)
        if (
            xp >= threshold
            and completions >= MIN_COMPLETIONS_TO_LEVEL_UP
            and (not gate_active or other_games >= MIN_OTHER_GAMES_ENGAGED)
        ):
            level += 1
            xp -= threshold
            completions = 0
            leveled_up = True
            was_active = gate_active
            gate_active = CROSS_GAME_GATE_LEVEL <= level < MAX_LEVEL
            if not gate_active:
                other_games = None
            elif not was_active:
                other_games = await count_other_games_played(conn, user_id, game_type)
            await conn.execute(
                """
                UPDATE game_progress SET level = $1, xp = $2, completions_at_level = $3, updated_at = now()
                WHERE user_id = $4 AND game_type = $5
                """,
                level, xp, completions, user_id, game_type,
            )

    return progress_payload(game_type, level, xp, completions, gate_active, other_games, leveled_up)


def progress_payload(game_type, level, xp, completions, gate_active, other_games, leveled_up=False):
    return {
        "game_type": game_type,
        "level": level,
        "xp": xp,
        "xp_for_next_level": xp_required_for_next_level(level) if level < MAX_LEVEL else 0,
        "completions_at_level": completions,
        "completions_needed": MIN_COMPLETIONS_TO_LEVEL_UP,
        "leveled_up": leveled_up,
        "cross_game_gate_active": gate_active,
        "other_games_played": other_games,
        "other_games_required": MIN_OTHER_GAMES_ENGAGED,
    }


async def game_progress_for(conn, user_id: uuid.UUID, game_type: str) -> Dict[str, Any]:
    row = await conn.fetchrow(
        "SELECT level, xp, completions_at_level FROM game_progress WHERE user_id = $1 AND game_type = $2",
        user_id, game_type,
    )
    level, xp, completions = (row["level"], row["xp"], row["completions_at_level"]) if row else (1, 0, 0)
    gate_active = CROSS_GAME_GATE_LEVEL <= level < MAX_LEVEL
    other_games = await count_other_games_played(conn, user_id, game_type) if gate_active else None
    return progress_payload(game_type, level, xp, completions, gate_active, other_games)


async def _evaluate_common_achievements(conn, user_id: uuid.UUID) -> List[str]:
    awarded = []
    distinct_games = await conn.fetchval(
        "SELECT count(DISTINCT game_type) FROM game_sessions WHERE user_id = $1", user_id
    )
    if distinct_games and distinct_games >= len(GAME_TYPES):
        if await award_achievement(conn, user_id, "security_sentinel"):
            awarded.append("security_sentinel")
    # Review accounts are unranked (NULL), and never push a real player down.
    rank = await conn.fetchval(
        """SELECT CASE WHEN me.is_review_account THEN NULL ELSE
                  (SELECT count(*) + 1 FROM users o
                    WHERE NOT o.is_review_account AND o.total_score > me.total_score) END
           FROM users me WHERE me.id = $1""",
        user_id,
    )
    if rank is not None and rank <= 10 and await award_achievement(conn, user_id, "high_scorer"):
        awarded.append("high_scorer")
    return awarded


async def complete_round(conn, user_id: uuid.UUID, round_row, score: int,
                         achievements: Optional[List[str]] = None,
                         puzzle_solved: bool = False,
                         passed: bool = True,
                         track_progress: bool = True) -> Dict[str, Any]:
    """Mark the round complete and grant score/XP/achievements. Call inside the
    same transaction that locked the round, so completion happens exactly once."""
    game_type = round_row["game_type"]
    cap = round_cap(game_type, round_row["level"])
    score = max(0, int(score))
    if score > cap:
        # Should be unreachable through legitimate play - log loudly and clamp.
        logger.warning("Clamped %s round %s score %s to cap %s", game_type, round_row["id"], score, cap)
        score = cap
    await conn.execute("UPDATE game_rounds SET completed_at = now() WHERE id = $1", round_row["id"])

    puzzles = await conn.fetchval(
        """
        UPDATE users
        SET total_score = total_score + $1,
            puzzles_completed = puzzles_completed + $2,
            last_active = now()
        WHERE id = $3
        RETURNING puzzles_completed
        """,
        score, 1 if puzzle_solved else 0, user_id,
    )
    overall_level_up = await update_overall_level(conn, user_id)
    game_progress = (
        await update_game_progress(conn, user_id, game_type, score, passed) if track_progress else None
    )

    await conn.execute(
        """
        INSERT INTO game_sessions (user_id, game_type, level, score, completed, started_at, completed_at)
        VALUES ($1, $2, $3, $4, TRUE, $5, now())
        """,
        user_id, game_type, round_row["level"], score, round_row["started_at"],
    )
    session_count = await conn.fetchval("SELECT count(*) FROM game_sessions WHERE user_id = $1", user_id)

    keys: List[str] = []
    candidates = list(achievements or [])
    if session_count == 1:
        candidates.insert(0, "first_steps")
    if puzzle_solved and puzzles == 1:
        candidates.append("first_decrypt")
    if puzzle_solved and puzzles and puzzles % 5 == 0:
        candidates.append("cipher_novice")
    for key in candidates:
        if await award_achievement(conn, user_id, key):
            keys.append(key)
    keys.extend(await _evaluate_common_achievements(conn, user_id))

    return {
        "score": score,
        "passed": passed,
        "new_achievements": achievement_payload(keys),
        "game_progress": game_progress,
        "overall_level_up": overall_level_up,
    }


async def run_locked(pool, request: Request, round_id: str, user_id: uuid.UUID, game_type: str, handler):
    """Open a transaction, lock the round, and run handler(conn, round_row).

    Idempotent per X-Request-Id: phones drop connections mid-request (Wi-Fi to
    cellular, tunnels, lifts). If a retry arrives with the same id as the last
    action applied to this round, the stored response is returned instead of
    applying the move twice - even if that action finished the round.
    """
    request_id = (request.headers.get(REQUEST_ID_HEADER) or "")[:64] or None
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await lock_round(conn, round_id, user_id, game_type)
                last = row["state"].get("_idem") or {}
                if request_id and last.get("id") == request_id:
                    return last["response"]
                if row["completed_at"] is not None:
                    raise HTTPException(status_code=409, detail="This round is already over")
                response = await handler(conn, row)
                if request_id:
                    await conn.execute(
                        "UPDATE game_rounds SET state = state || $2::jsonb WHERE id = $1",
                        row["id"], {"_idem": {"id": request_id, "response": jsonable_encoder(response)}},
                    )
                return response
    except asyncpg.PostgresError:
        logger.exception("Round %s action failed", round_id)
        raise HTTPException(status_code=503, detail="Couldn't save that move. Try again.")

