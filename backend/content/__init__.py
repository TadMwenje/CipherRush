"""Server-side content banks for every CipherRush mode."""
from content.binhex import CHALLENGES as BINHEX_CHALLENGES, FORMATS as BINHEX_FORMATS  # noqa: F401
from content.phrases import PHRASES, RUSH_WORDS, VIGENERE_KEYS  # noqa: F401
from content.quiz import QUIZ_CATEGORIES, QUIZ_CATEGORY_LABELS, QUIZ_QUESTIONS  # noqa: F401
from content.truefalse import TRUE_FALSE_STATEMENTS  # noqa: F401
from content._legacy import GAME_SYMBOLS  # noqa: F401


def phrase_tier(phrase: str) -> int:
    words = len(phrase.split())
    return 1 if words <= 2 else 2 if words <= 4 else 3


CIPHER_PHRASES = {tier: [p for p in PHRASES if phrase_tier(p) == tier] for tier in (1, 2, 3)}
