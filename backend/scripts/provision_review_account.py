"""Create or reset the App Store / Google Play review accounts.

    cd backend
    read -rs DATABASE_URL && export DATABASE_URL   # Render -> cipherrush-db -> External Database URL
    .venv/bin/python scripts/provision_review_account.py --yes \
        --verify-api https://api.aximoix.com \
        --credentials-file ../mobile/store/REVIEWER_CREDENTIALS.txt
    unset DATABASE_URL

Run it yourself; the accounts live in whichever database DATABASE_URL names.
Each is an ordinary player (there are no roles or admin rights in CipherRush)
flagged `is_review_account`, so it never appears on or affects the
leaderboards. It starts at account level 2 with a couple of badges so review
screens aren't empty.

Fresh random passwords are generated on every run; running again rotates them
and signs out every session. With --verify-api each account must log in over
HTTP before anything is written. With --credentials-file the passwords go to a
gitignored, owner-only file; without it they are printed once to the terminal.
--store limits the run to one store (default: both).
"""
import argparse
import asyncio
import datetime
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

import asyncpg
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from moderation import normalize_email, validate_username  # noqa: E402
from review_accounts import (  # noqa: E402,F401 - re-exported for the tests
    SAMPLE_BADGES, SAMPLE_SCORE, STORES, generate_password, provision,
)

def verify_login(api: str, username: str, password: str) -> None:
    """Log in over HTTP exactly as the app does; raise unless a session is issued."""
    res = httpx.post(
        f"{api.rstrip('/')}/api/auth/login",
        json={"username": username, "password": password},
        headers={"X-Requested-With": "CipherRush"},
        timeout=90,  # a sleeping free-plan instance takes ~50 s to wake
    )
    if res.status_code != 200 or not res.cookies:
        raise SystemExit(f"Login check failed for {username}: HTTP {res.status_code} {res.text[:200]}")


def credentials_text(api: str, accounts) -> str:
    rule = "=" * 52
    lines = [
        rule,
        "CIPHERRUSH STORE REVIEWER CREDENTIALS (PRODUCTION)",
        f"Target API: {api}",
        f"Generated Date: {datetime.date.today().isoformat()}",
        rule,
    ]
    for n, (label, username, email, password) in enumerate(accounts, 1):
        lines += [
            "",
            f"{n}. {label}",
            f"   - Email / Username: {email} / {username}",
            f"   - Password: {password}",
            "   - Access Notes: Log in with the username (handle). No OTP or phone check;"
            " account level 2 with sample badges.",
        ]
    lines += [rule, ""]
    return "\n".join(lines)


def write_credentials(path: Path, text: str) -> None:
    """Owner-only, and only where git ignores it: this repo is public."""
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", str(path)], cwd=path.parent, capture_output=True
    ).returncode == 0
    if not ignored:
        raise SystemExit(f"{path} is not gitignored; refusing to write passwords there.")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(text)
    os.chmod(path, 0o600)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--store", choices=sorted(STORES), action="append",
                        help="provision only this store's account (repeatable; default both)")
    parser.add_argument("--yes", action="store_true", help="skip the database host confirmation")
    parser.add_argument("--verify-api", metavar="URL", help="log each account in against this API first")
    parser.add_argument("--credentials-file", type=Path, help="write passwords here (must be gitignored)")
    args = parser.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("Set DATABASE_URL to the target database first.")
    host = urlsplit(dsn).hostname
    if not args.yes and input(f"Provision review accounts on {host}? Type the host to confirm: ").strip() != host:
        raise SystemExit("Cancelled.")
    credentials_file = args.credentials_file.resolve() if args.credentials_file else None
    if credentials_file and not credentials_file.parent.is_dir():
        raise SystemExit(f"{credentials_file.parent} does not exist.")

    accounts = []
    conn = await asyncpg.connect(dsn)
    try:
        has_flag = await conn.fetchval(
            """SELECT 1 FROM information_schema.columns
               WHERE table_name = 'users' AND column_name = 'is_review_account'"""
        )
        if not has_flag:
            raise SystemExit("This database predates review accounts. Deploy the current backend first.")
        for store in args.store or list(STORES):
            label, username, email, _ = STORES[store]
            username, email = validate_username(username), normalize_email(email)
            password = generate_password()
            outcome = await provision(conn, username, email, password)
            print(f"{label}: {username} {outcome}.")
            accounts.append((label, username, email, password))
    finally:
        await conn.close()

    if args.verify_api:
        for _, username, _, password in accounts:
            verify_login(args.verify_api, username, password)
            print(f"Login verified for {username} on {args.verify_api}.")

    api = args.verify_api or "https://api.aximoix.com"
    if credentials_file:
        write_credentials(credentials_file, credentials_text(api, accounts))
        print(f"Credentials written to {credentials_file} (owner-only, gitignored).")
    else:
        print()
        print(credentials_text(api, accounts))
        print("Paste these into the store forms now. They are not saved anywhere.")


if __name__ == "__main__":
    asyncio.run(main())
