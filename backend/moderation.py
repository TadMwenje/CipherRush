"""Username, email, and password validation for account registration.

Centralizes the rules the frontend also mirrors for immediate feedback, but
this module is the source of truth: the backend re-validates everything
regardless of what the client already checked.
"""
import json
import re
from pathlib import Path

from better_profanity import profanity

profanity.load_censor_words()

# better_profanity matches whole "words" (split on delimiters), which misses
# usernames typed as one unbroken token like "fuckyou" (no delimiter for it to
# split on). We can't safely substring-match its full wordlist for this - it's
# a large multi-language list full of short stems ("teste", "ass", "sex")
# that collide with ordinary words (tester, assassin, sussex). The curated
# list in content/handle_blocklist.json does the substring pass instead (its
# header explains the four lists). The app ships an identical copy and runs
# the same rules (frontend/src/moderation/handle.js) for instant feedback;
# this module is what actually decides.
_BLOCKLIST = json.loads((Path(__file__).parent / "content" / "handle_blocklist.json").read_text(encoding="utf-8"))

# Two readings of "1" (i and l), since both show up in bypasses: n1gger, a55ho1e.
_LEET_I = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "$": "s", "@": "a"})
_LEET_L = str.maketrans({"0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "$": "s", "@": "a"})


def _stretchy(term: str) -> str:
    """A pattern for `term` where any letter may repeat: fuck -> f+u+c+k+."""
    return "".join(f"{re.escape(ch)}+" for ch in term)


def _alternation(terms) -> str:
    return "|".join(_stretchy(t.translate(_LEET_I)) for t in sorted(set(terms), key=len, reverse=True))


_ANYWHERE = re.compile(_alternation(_BLOCKLIST["anywhere"]))
_WHOLE = re.compile(rf"^(?:{_alternation(_BLOCKLIST['whole'])})$")
_TARGET = _alternation(_BLOCKLIST["targets"])
_INSULT = _alternation(_BLOCKLIST["insults"])
_HATE_PAIR = re.compile(rf"(?:{_TARGET}).{{0,3}}(?:{_INSULT})|(?:{_INSULT}).{{0,3}}(?:{_TARGET})")
_ALLOW = re.compile("|".join(re.escape(w) for w in _BLOCKLIST["allow"]))


def _readings(text: str):
    return {text.translate(_LEET_I), text.translate(_LEET_L)}


def _contains_blocked_word(username: str) -> bool:
    lowered = username.lower()
    if profanity.contains_profanity(lowered) or profanity.contains_profanity(lowered.translate(_LEET_I)):
        return True
    for reading in _readings(lowered):
        parts = [p for p in reading.split("_") if p]
        if any(_WHOLE.match(p) for p in parts + ["".join(parts)]):
            return True
        joined = _ALLOW.sub("#", "".join(parts))
        if _ANYWHERE.search(joined) or _HATE_PAIR.search(joined):
            return True
    return False

USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
# 8+ chars, at least one lowercase, one uppercase, one digit.
PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$")


class ValidationError(Exception):
    """Raised with a user-facing message when input fails validation."""


def normalize_username(username: str) -> str:
    return username.strip().lower()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_username(username: str) -> str:
    """Returns the normalized username, or raises ValidationError."""
    normalized = normalize_username(username)

    if not USERNAME_PATTERN.match(normalized):
        raise ValidationError(
            "Username must be 3-20 characters and contain only letters, numbers, and underscores."
        )

    if _contains_blocked_word(normalized):
        raise ValidationError("That username isn't allowed. Please choose another.")

    return normalized


def validate_password(password: str) -> None:
    if not PASSWORD_PATTERN.match(password):
        raise ValidationError(
            "Password must be at least 8 characters and include an uppercase letter, "
            "a lowercase letter, and a number."
        )
