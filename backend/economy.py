"""CipherRush scoring economy - every tunable number lives here.

Design targets (level 1, competent player):
    roughly 120-200 points per minute of play in every mode, so no mode is the
    obvious grind. With 1,000 XP per early level, that's 6-8 minutes and at
    least 4 *cleared* rounds per level.

Rules that keep the leaderboard honest:
  * Level scaling is logarithmic: level 50 pays ~3x level 1, not 50x.
  * Streak/combo/cascade multipliers taper off and hit a hard ceiling.
  * Every round is clamped to a per-mode cap, so a scoring bug can't mint
    unlimited points.
  * Only cleared rounds count toward levelling up; losing rounds earn their
    (small) score but can't be farmed for progress.
"""
import math

# --- shared curves ---------------------------------------------------------------

def level_factor(level: int) -> float:
    return 1 + 0.5 * math.log(max(1, level))


def tapered_multiplier(streak: int, first_step: float, ceiling: float) -> float:
    """Multiplier for the Nth consecutive success. The first bonus step is
    `first_step`; each step after is smaller, and it never exceeds `ceiling`."""
    if streak <= 1:
        return 1.0
    ratio = 1 - first_step / (ceiling - 1)
    return round(1 + (ceiling - 1) * (1 - ratio ** (streak - 1)), 2)


# --- per-mode constants -----------------------------------------------------------

CIPHER_BASE = 100
CIPHER_VARIANT_MULT = {"caesar": 1.0, "atbash": 0.8, "vigenere": 1.5}
CIPHER_TIME_LIMIT = {"caesar": 120, "atbash": 120, "vigenere": 180}
CIPHER_TIME_BONUS_MAX = 0.5   # up to +50% of the base for an instant solve
CIPHER_HINT_PENALTY = 0.2     # each paid hint costs 20% of the base
CIPHER_FLOOR = 0.1            # a solve is always worth at least 10% of the base

QUIZ_PER_CORRECT = 30
QUIZ_ROUND_SIZE = 5
QUIZ_PASS_RATIO = 0.6
# Hints strike out one wrong option each. The first few a round are free; after
# that each one is paid for with a rewarded video (ads.py), never with points.
QUIZ_FREE_HINTS = 3
# A hint never takes a question below two options (the answer and one decoy).
QUIZ_MIN_OPTIONS = 2

TF_PER_CORRECT = 12
TF_ROUND_SIZE = 10
TF_STREAK_FIRST_STEP = 0.15
TF_STREAK_CEILING = 1.5
TF_PASS_RATIO = 0.7

BINHEX_PER_CORRECT = 30
BINHEX_TIER_MULT = {1: 1.0, 2: 1.2, 3: 1.4}
BINHEX_ROUND_SIZE = 5
BINHEX_PASS_CORRECT = 3

MATCH3_POINTS_PER_TILE = 5
MATCH3_CASCADE_FIRST_STEP = 0.5
MATCH3_CASCADE_CEILING = 2.5
MATCH3_EFFICIENCY_PER_MOVE = 5
MATCH3_BOARD_SIZE = 6  # fixed: 6x6 keeps every tile >= 48dp on a 360dp-wide phone

MEMORY_PER_PAIR = 25
MEMORY_MISS_PENALTY = 5
MEMORY_FLOOR = 0.3
MEMORY_PAIRS_BY_LEVEL = [4, 6, 6, 8, 8, 10, 10, 12]

RUSH_DURATION = 90
RUSH_PER_WORD = 15
RUSH_COMBO_FIRST_STEP = 0.5
RUSH_COMBO_CEILING = 2.5

DAILY_TIME_LIMIT = 180
DAILY_BASE = 200
DAILY_TIME_BONUS_MAX = 100
DAILY_STREAK_BONUS_PER_DAY = 10
DAILY_STREAK_BONUS_CAP = 70


def match3_params(level: int) -> dict:
    """Difficulty comes from symbol variety, target and move budget - never board size."""
    if level <= 2:
        symbols, target, moves = 4, 220, 22
    elif level <= 4:
        symbols, target, moves = 5, 200, 22
    elif level <= 7:
        symbols, target, moves = 5, 240, 20
    elif level <= 10:
        symbols, target, moves = 6, 200, 22
    else:
        symbols, target, moves = 6, 200 + 10 * (min(level, 30) - 10), 22
    return {"size": MATCH3_BOARD_SIZE, "num_symbols": symbols, "target": target, "moves": moves}


def memory_pairs(level: int) -> int:
    return MEMORY_PAIRS_BY_LEVEL[min(level, len(MEMORY_PAIRS_BY_LEVEL)) - 1]


def rush_pass_threshold(level: int) -> int:
    return 6 + min(level, 18) // 3


# --- caps & pass rules ----------------------------------------------------------------

def round_cap(game_type: str, level: int) -> int:
    lf = level_factor(level)
    caps = {
        "cipher": CIPHER_BASE * max(CIPHER_VARIANT_MULT.values()) * (1 + CIPHER_TIME_BONUS_MAX) * lf,
        "quiz": QUIZ_PER_CORRECT * QUIZ_ROUND_SIZE * lf,
        "truefalse": TF_PER_CORRECT * TF_STREAK_CEILING * TF_ROUND_SIZE * lf,
        "binhex": BINHEX_PER_CORRECT * max(BINHEX_TIER_MULT.values()) * BINHEX_ROUND_SIZE * lf,
        "match3": 1500,
        "memory": MEMORY_PER_PAIR * max(MEMORY_PAIRS_BY_LEVEL) * lf,
        "rush": 1200 * lf,
        "daily": DAILY_BASE + DAILY_TIME_BONUS_MAX + DAILY_STREAK_BONUS_CAP,
    }
    return int(math.ceil(caps[game_type]))
