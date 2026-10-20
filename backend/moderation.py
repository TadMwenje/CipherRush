"""Username, email, and password validation for account registration.

Centralizes the rules the frontend also mirrors for immediate feedback, but
this module is the source of truth: the backend re-validates everything
regardless of what the client already checked.
"""
import re
from better_profanity import profanity

profanity.load_censor_words()

# better_profanity matches whole "words" (split on delimiters), which misses
# usernames typed as one unbroken token like "fuckyou" (no delimiter for it to
# split on). We can't safely substring-match its full wordlist for this - it's
# a large multi-language list full of short stems ("teste", "ass", "sex")
# that collide with ordinary words (tester, assassin, sussex). Instead, a
# curated, high-confidence list is used for the substring pass: severe
# profanity, slurs, hate symbols/extremist handles, and a few reserved system
# names. Checked against a leetspeak-normalized token so "fuckyou"/"n1gger"
# style bypasses are still caught.
_EXTRA_BLOCKED_TERMS = [
    "fuck",
    "shit",
    "bitch",
    "cunt",
    "asshole",
    "dickhead",
    "whore",
    "slut",
    "rape",
    "nigger",
    "nigga",
    "faggot",
    "retard",
    "hitler",
    "nazi",
    "kkk",
    "isis",
    "terrorist",
    "admin",
    "administrator",
    "moderator",
    "cipherrush",
    "support",
    "system",
    "root",
]

_LEET_MAP = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "$": "s", "@": "a"})


def _deleet(token: str) -> str:
    return token.translate(_LEET_MAP)


def _contains_blocked_word(token: str) -> bool:
    lowered = token.lower()
    deleeted = _deleet(lowered)
    if profanity.contains_profanity(lowered) or profanity.contains_profanity(deleeted):
        return True
    return any(term in deleeted for term in _EXTRA_BLOCKED_TERMS)

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

    stripped = normalized.replace("_", "")

    if _contains_blocked_word(normalized) or _contains_blocked_word(stripped):
        raise ValidationError("That username isn't allowed. Please choose another.")

    return normalized


def validate_password(password: str) -> None:
    if not PASSWORD_PATTERN.match(password):
        raise ValidationError(
            "Password must be at least 8 characters and include an uppercase letter, "
            "a lowercase letter, and a number."
        )
