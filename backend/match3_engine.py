"""Server-authoritative Match-3 engine.

The client only proposes swaps; this module decides whether they are legal,
resolves cascades with a server-held RNG, and computes the score. Refill
randomness is derived from the round's secret seed and move number, so the
next tiles can't be predicted from anything the client is shown.
"""
import random
from typing import Dict, List, Optional, Set, Tuple

from economy import (
    MATCH3_CASCADE_CEILING,
    MATCH3_CASCADE_FIRST_STEP,
    MATCH3_POINTS_PER_TILE,
    tapered_multiplier,
)

Board = List[List[str]]
Cell = Tuple[int, int]

# Hard safety caps. A refill can in theory keep producing matches forever (and
# will, with a single symbol type); board generation is random. Neither may
# ever hang a request or raise mid-game.
MAX_CASCADES = 25
MAX_GENERATION_ATTEMPTS = 500

def _rng(seed: str, salt: str) -> random.Random:
    return random.Random(f"{seed}:{salt}")


def find_matches(board: Board) -> Set[Cell]:
    size = len(board)
    matched: Set[Cell] = set()
    for r in range(size):
        run = 1
        for c in range(1, size + 1):
            if c < size and board[r][c] == board[r][c - 1]:
                run += 1
            else:
                if run >= 3:
                    matched.update((r, k) for k in range(c - run, c))
                run = 1
    for c in range(size):
        run = 1
        for r in range(1, size + 1):
            if r < size and board[r][c] == board[r - 1][c]:
                run += 1
            else:
                if run >= 3:
                    matched.update((k, c) for k in range(r - run, r))
                run = 1
    return matched


def _swapped(board: Board, a: Cell, b: Cell) -> Board:
    nb = [row[:] for row in board]
    nb[a[0]][a[1]], nb[b[0]][b[1]] = nb[b[0]][b[1]], nb[a[0]][a[1]]
    return nb


def is_adjacent(a: Cell, b: Cell) -> bool:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1


def find_valid_move(board: Board) -> Optional[Tuple[Cell, Cell]]:
    size = len(board)
    for r in range(size):
        for c in range(size):
            for dr, dc in ((0, 1), (1, 0)):
                r2, c2 = r + dr, c + dc
                if r2 < size and c2 < size and find_matches(_swapped(board, (r, c), (r2, c2))):
                    return (r, c), (r2, c2)
    return None


def _fallback_board(size: int, symbols: List[str]) -> Board:
    """Deterministic board with no matches: a striped pattern of the symbols.
    Used only if random generation somehow keeps failing."""
    n = len(symbols)
    if n < 3:
        return [[symbols[(r + c) % n] for c in range(size)] for r in range(size)]
    return [[symbols[(r + 2 * c) % n] for c in range(size)] for r in range(size)]


def generate_board(size: int, symbols: List[str], rng: random.Random) -> Board:
    """A board with no pre-existing matches and (almost always) a legal move.
    Never raises and never loops unbounded."""
    if len(set(symbols)) < 3:
        return _fallback_board(size, symbols)  # can't avoid both matches and dead boards
    best: Optional[Board] = None
    for _ in range(MAX_GENERATION_ATTEMPTS):
        board: Board = []
        for r in range(size):
            row: List[str] = []
            for c in range(size):
                forbidden = set()
                if c >= 2 and row[c - 1] == row[c - 2]:
                    forbidden.add(row[c - 1])
                if r >= 2 and board[r - 1][c] == board[r - 2][c]:
                    forbidden.add(board[r - 1][c])
                row.append(rng.choice([s for s in symbols if s not in forbidden] or symbols))
            board.append(row)
        if not find_matches(board):
            best = board
            if find_valid_move(board):
                return board
    return best or _fallback_board(size, symbols)


def resolve_swap(board: Board, a: Cell, b: Cell, symbols: List[str], seed: str, move_no: int) -> Dict:
    """Apply a legal swap and resolve all cascades.

    Returns {"steps": [...], "board": final, "gained": int, "reshuffled": bool}.
    Each step is {"matched": [[r, c]...], "board": after_refill, "drops": [n per column],
    "cascade": k, "gained": pts} so the client can animate exactly what happened.
    """
    rng = _rng(seed, f"move-{move_no}")
    size = len(board)
    current = _swapped(board, a, b)
    steps = []
    total = 0
    cascade = 1
    capped = False
    while True:
        matched = find_matches(current)
        if not matched:
            break
        if cascade > MAX_CASCADES:
            capped = True
            break
        multiplier = tapered_multiplier(cascade, MATCH3_CASCADE_FIRST_STEP, MATCH3_CASCADE_CEILING)
        gained = int(round(len(matched) * MATCH3_POINTS_PER_TILE * multiplier))
        total += gained
        drops = [0] * size
        nb = [row[:] for row in current]
        for c in range(size):
            surviving = [current[r][c] for r in range(size) if (r, c) not in matched]
            missing = size - len(surviving)
            drops[c] = missing
            column = [rng.choice(symbols) for _ in range(missing)] + surviving
            for r in range(size):
                nb[r][c] = column[r]
        current = nb
        steps.append({
            "matched": sorted([list(cell) for cell in matched]),
            "board": [row[:] for row in current],
            "drops": drops,
            "cascade": cascade,
            "multiplier": multiplier,
            "gained": gained,
        })
        cascade += 1

    reshuffled = False
    if capped or not find_valid_move(current):
        current = generate_board(size, symbols, _rng(seed, f"reshuffle-{move_no}"))
        reshuffled = True

    return {"steps": steps, "board": current, "gained": total, "reshuffled": reshuffled}

