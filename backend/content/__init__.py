"""Server-side content banks for every CipherRush mode."""
import hashlib

from content.binhex import CHALLENGES as BINHEX_CHALLENGES, FORMATS as BINHEX_FORMATS  # noqa: F401
from content.phrases import PHRASES, RUSH_WORDS, VIGENERE_KEYS  # noqa: F401
from content.quiz import QUIZ_CATEGORIES, QUIZ_CATEGORY_LABELS, QUIZ_QUESTIONS  # noqa: F401
from content.truefalse import TRUE_FALSE_STATEMENTS  # noqa: F401
from content._legacy import GAME_SYMBOLS  # noqa: F401


def phrase_tier(phrase: str) -> int:
    words = len(phrase.split())
    return 1 if words <= 2 else 2 if words <= 4 else 3


def is_practice_item(text: str) -> bool:
    """About one item in five belongs to offline Practice Mode.

    Practice runs in the app with no server, so its items (and their answers)
    ship inside the app bundle. Those items are never used in scored rounds,
    which keeps the bundle from being an answer key for the real game. Hashing
    the text keeps the split stable when the banks grow or get reordered.
    """
    return hashlib.sha256(text.encode("utf-8")).digest()[0] % 5 == 0


PRACTICE_PHRASES = [p for p in PHRASES if is_practice_item(p)]
SCORED_PHRASES = [p for p in PHRASES if not is_practice_item(p)]
PRACTICE_TF_INDICES = frozenset(i for i, s in enumerate(TRUE_FALSE_STATEMENTS) if is_practice_item(s["statement"]))

CIPHER_PHRASES = {tier: [p for p in SCORED_PHRASES if phrase_tier(p) == tier] for tier in (1, 2, 3)}
