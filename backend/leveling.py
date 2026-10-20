"""Shared XP/level progression curve, used for both the overall account level
and each individual game's level.

XP required to advance FROM level N TO level N+1:
    levels 1-4    -> 1,000 XP flat
    levels 5-9    -> 1,250 XP flat
    levels 10-14  -> 2,500 XP flat
    levels 15-29  -> +150 XP per level over the previous level's requirement
    levels 30-99  -> +2.5% per level (compounding) over the previous requirement
    levels 100-199 -> +5% per level (compounding) over the previous requirement
    level 200+    -> holds steady at the level-199 requirement (progression cap)

Game-level advancement additionally requires a minimum number of completed
rounds at the current level (MIN_COMPLETIONS_TO_LEVEL_UP), so a lucky high-XP
run can't vault a game level (or several) without actually playing it - see
update_game_progress in server.py.
"""

MAX_LEVEL = 200
MIN_COMPLETIONS_TO_LEVEL_UP = 4

# Starting at this per-game level, advancing further also requires having
# engaged with other game modes - grinding one game alone stops being enough,
# which is the point: it nudges players toward the rest of CipherRush instead
# of turning any single game into the only thing worth playing.
CROSS_GAME_GATE_LEVEL = 5
MIN_OTHER_GAMES_ENGAGED = 2


def _build_level_steps():
    """steps[level] = XP required to advance from `level` to `level + 1`."""
    steps = {}
    prev = 1000
    for level in range(1, MAX_LEVEL):
        if level < 5:
            step = 1000
        elif level < 10:
            step = 1250
        elif level < 15:
            step = 2500
        elif level < 30:
            step = prev + 150
        elif level < 100:
            step = round(prev * 1.025)
        elif level < 200:
            step = round(prev * 1.05)
        else:
            step = prev
        steps[level] = step
        prev = step
    return steps


_LEVEL_STEPS = _build_level_steps()


def _build_cumulative_thresholds():
    """cumulative[level] = total XP required to REACH `level` (level 1 = 0 XP)."""
    cumulative = {1: 0}
    total = 0
    for level in range(1, MAX_LEVEL):
        total += _LEVEL_STEPS[level]
        cumulative[level + 1] = total
    return cumulative


_CUMULATIVE_THRESHOLDS = _build_cumulative_thresholds()


def xp_required_for_next_level(level: int) -> int:
    """XP needed to go from `level` to `level + 1`."""
    level = max(1, min(level, MAX_LEVEL - 1))
    return _LEVEL_STEPS[level]


def compute_level(total_xp: int) -> int:
    """Given cumulative XP, return the level that total has reached."""
    level = 1
    for lvl in range(2, MAX_LEVEL + 1):
        if total_xp >= _CUMULATIVE_THRESHOLDS[lvl]:
            level = lvl
        else:
            break
    return level


def xp_progress(total_xp: int) -> dict:
    """Progress info for a level bar: current level, XP earned into it, XP needed
    for the next level, and percent complete."""
    level = compute_level(total_xp)
    xp_into_level = total_xp - _CUMULATIVE_THRESHOLDS.get(level, 0)
    if level >= MAX_LEVEL:
        return {"level": level, "xp_into_level": xp_into_level, "xp_for_next_level": 0, "percent": 100}
    next_step = xp_required_for_next_level(level)
    percent = min(100, round((xp_into_level / next_step) * 100)) if next_step else 100
    return {
        "level": level,
        "xp_into_level": xp_into_level,
        "xp_for_next_level": next_step,
        "percent": percent,
    }
