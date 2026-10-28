"""Create or reset an App Store / Google Play review account.

    DATABASE_URL=<external database URL> .venv/bin/python scripts/provision_review_account.py \
        --username play_review --email play-review@aximoix.com

Run it yourself; the account lives in whichever database DATABASE_URL names.
The account is an ordinary player (there are no roles or admin rights in
CipherRush) flagged `is_review_account`, so it never appears on or affects the
leaderboards. It starts at account level 2 with a couple of badges so review
screens aren't empty.

A fresh random password is generated on every run and printed once to this
terminal. It is never written to disk: paste it straight into the Play Console
"App access" form or App Store Connect "Sign-in information", then clear the
terminal. Running again rotates the password and signs out every session.
"""
import argparse
import asyncio
import os
import secrets
import string
import sys
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from leveling import compute_level  # noqa: E402
from moderation import PASSWORD_PATTERN, ValidationError, normalize_email, validate_username  # noqa: E402
from rounds import ACHIEVEMENTS  # noqa: E402
from security import hash_password  # noqa: E402

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
                """UPDATE users SET password_hash = $2, email = $3,
                          session_version = session_version + 1 WHERE id = $1""",
                user_id, password_hash, email,
            )
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
            outcome = "reset"
        else:
            user_id = await conn.fetchval(
                """INSERT INTO users (username, password_hash, email, is_review_account)
                   VALUES ($1, $2, $3, true) RETURNING id""",
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


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    try:
        username = validate_username(args.username)
    except ValidationError as exc:
        raise SystemExit(str(exc))
    email = normalize_email(args.email)

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("Set DATABASE_URL to the target database first.")
    host = urlsplit(dsn).hostname
    if input(f"Provision review account '{username}' on {host}? Type the host to confirm: ").strip() != host:
        raise SystemExit("Cancelled.")

    password = generate_password()
    conn = await asyncpg.connect(dsn)
    try:
        has_flag = await conn.fetchval(
            """SELECT 1 FROM information_schema.columns
               WHERE table_name = 'users' AND column_name = 'is_review_account'"""
        )
        if not has_flag:
            raise SystemExit("This database predates review accounts. Deploy the current backend first.")
        outcome = await provision(conn, username, email, password)
    finally:
        await conn.close()

    print(f"\nReview account {outcome}.")
    print(f"  Username: {username}")
    print(f"  Password: {password}")
    print("Paste these into the store's review form now. They are not saved anywhere.")


if __name__ == "__main__":
    asyncio.run(main())
