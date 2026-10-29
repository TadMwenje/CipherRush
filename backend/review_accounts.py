"""Store review accounts (App Store and Google Play reviewers).

Each is an ordinary player flagged `is_review_account`, so it never appears on
or affects the leaderboards. It starts at account level 2 with a couple of
badges so review screens aren't empty.

Two ways to set them up, both upserting through provision():
  * on every server start, from REVIEW_PLAY_PASSWORD / REVIEW_APPSTORE_PASSWORD
    (Render -> Environment). Passwords never go in this repo: it's public.
  * scripts/provision_review_account.py, which generates fresh passwords.
"""
import logging
import os
import secrets
import string

from leveling import compute_level
from moderation import PASSWORD_PATTERN, normalize_email, validate_username
from rounds import ACHIEVEMENTS
from security import hash_password, verify_password

logger = logging.getLogger(__name__)

# store: (label, username, email, environment variable holding its password)
STORES = {
    "play": ("GOOGLE PLAY CONSOLE REVIEWER", "play_review", "play-review@aximoix.com", "REVIEW_PLAY_PASSWORD"),
    "appstore": ("APPLE APP STORE CONNECT REVIEWER", "appstore_review", "appstore-review@aximoix.com",
                 "REVIEW_APPSTORE_PASSWORD"),
}
SAMPLE_SCORE = 1500  # account level 2, halfway to level 3
SAMPLE_BADGES = ("first_steps", "first_decrypt")
# No look-alike characters (0/O, 1/l/I): reviewers type this by hand.
_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")


def generate_password(length: int = 20) -> str:
    while True:
        candidate = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if PASSWORD_PATTERN.match(candidate):
            return candidate


async def provision(conn, username: str, email: str, password: str) -> str:
    """Upsert the review account; returns "created" or "reset"."""
    password_hash = hash_password(password)
    async with conn.transaction():
        existing = await conn.fetchrow(
            "SELECT id, is_review_account FROM users WHERE lower(username) = $1", username
        )
        if existing and not existing["is_review_account"]:
            raise SystemExit(f"'{username}' is a real player's account. Pick another username.")
        if existing:
            user_id = existing["id"]
            # Bumping session_version revokes every session issued with the old password.
            await conn.execute(
                """UPDATE users SET password_hash = $2, email = $3, is_verified = true,
                          session_version = session_version + 1 WHERE id = $1""",
                user_id, password_hash, email,
            )
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
            outcome = "reset"
        else:
            user_id = await conn.fetchval(
                # Verified up front: reviewers can't read these inboxes, and mustn't be asked to.
                """INSERT INTO users (username, password_hash, email, is_review_account, is_verified)
                   VALUES ($1, $2, $3, true, true) RETURNING id""",
                username, password_hash, email,
            )
            outcome = "created"

        await conn.execute(
            "UPDATE users SET total_score = GREATEST(total_score, $2), level = $3 WHERE id = $1",
            user_id, SAMPLE_SCORE, compute_level(SAMPLE_SCORE),
        )
        for key in SAMPLE_BADGES:
            badge_name, description = ACHIEVEMENTS[key]
            if not await conn.fetchval(
                "SELECT 1 FROM achievements WHERE user_id = $1 AND badge_name = $2", user_id, badge_name
            ):
                await conn.execute(
                    "INSERT INTO achievements (user_id, badge_name, description) VALUES ($1, $2, $3)",
                    user_id, badge_name, description,
                )
                await conn.execute(
                    "UPDATE users SET badges = array_append(badges, $2) WHERE id = $1", user_id, badge_name
                )
    return outcome


async def seed_from_env(conn, env=os.environ) -> None:
    """Startup: make each review account whose password is set in the environment
    log in with exactly that password. A password that already matches is left
    alone, so restarts don't sign reviewers out."""
    for label, username, email, var in STORES.values():
        password = env.get(var, "").strip()
        if not password:
            continue
        if not PASSWORD_PATTERN.match(password):
            logger.error("%s doesn't meet the password rules; %s not seeded", var, username)
            continue
        row = await conn.fetchrow(
            "SELECT password_hash, is_review_account FROM users WHERE lower(username) = $1", username
        )
        if row and row["is_review_account"] and verify_password(password, row["password_hash"]):
            continue
        try:
            outcome = await provision(conn, validate_username(username), normalize_email(email), password)
        except SystemExit as exc:  # a real player already holds the handle
            logger.error("Review account %s not seeded: %s", username, exc)
            continue
        logger.info("Review account %s %s from %s", username, outcome, var)
