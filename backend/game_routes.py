"""Server-authoritative game endpoints.

Every mode follows the same lifecycle: POST .../rounds creates a round whose
secret state (answers, deck order, RNG seed) stays in the database; the client
then sends only raw player input against that round id; the server validates
it, computes the score, and completes the round exactly once.

GET .../rounds/active returns the player's open round (if any) so a phone that
killed the app mid-game can pick up exactly where it left off.
"""
import secrets
from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

import ads
import ciphers
import economy as eco
import match3_engine
from auth import get_current_user
from content import (
    BINHEX_CHALLENGES,
    BINHEX_FORMATS,
    CIPHER_PHRASES,
    GAME_SYMBOLS,
    PRACTICE_TF_INDICES,
    QUIZ_CATEGORY_LABELS,
    QUIZ_QUESTIONS,
    RUSH_WORDS,
    TRUE_FALSE_STATEMENTS,
    VIGENERE_KEYS,
)
from content.binhex import display as binhex_display, encode_byte
from db import get_pool
from ratelimit import limiter
from rounds import (
    GAME_TYPES,
    complete_round,
    create_round,
    elapsed_seconds,
    get_game_level,
    is_expired,
    run_locked,
    save_state,
)

router = APIRouter(prefix="/api/games")
_rand = secrets.SystemRandom()

START_LIMIT = "30/minute"
ACTION_LIMIT = "240/minute"


class StrictModel(BaseModel):
    # Unknown fields (user_id, score, level, answer keys...) are rejected outright.
    model_config = ConfigDict(extra="forbid")


async def _start(user, game_type: str, build_state, ttl_seconds):
    """Create a round at the player's current level for this game.
    build_state(conn, level) -> (secret_state, public_payload). The static
    public payload is kept in state so the round can be resumed later."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        level = await get_game_level(conn, user["id"], game_type)
        state, public = await build_state(conn, level)
        if await ads.take_boost(conn, user["id"], game_type):
            state["boost"] = True
            public = {**public, "boosted": True}
        state["public"] = public
        ttl = ttl_seconds(state) if callable(ttl_seconds) else ttl_seconds
        round_id = await create_round(conn, user["id"], game_type, level, state, ttl)
    return {"round_id": str(round_id), "level": level, **public}


async def _locked(request: Request, round_id: str, user, game_type: str, handler):
    return await run_locked(await get_pool(), request, round_id, user["id"], game_type, handler)


# =============================================================================
# CIPHER PUZZLES (Caesar / Atbash / Vigenere)
# =============================================================================

def _cipher_tier(level: int) -> int:
    return 1 if level <= 2 else 2 if level <= 5 else 3


def _vigenere_key_tier(level: int) -> int:
    return 1 if level <= 3 else 2 if level <= 6 else 3 if level <= 9 else 4


class CipherStart(StrictModel):
    variant: Literal["caesar", "atbash", "vigenere"] = "caesar"


class CipherAnswer(StrictModel):
    answer: str = Field(default="", max_length=200)


class CipherHint(StrictModel):
    # Set when the hint was paid for with a verified rewarded ad instead of points.
    reward_id: Optional[str] = Field(default=None, max_length=64)


def build_cipher_puzzle(variant: str, plaintext: str, rng, key_tier: int):
    """Shared by Cipher Puzzles and the Daily Cipher. Returns (secret, public)."""
    first_word = plaintext.split()[0]
    secret: Dict[str, Any] = {"variant": variant, "plaintext": plaintext, "hints_used": 0}
    public: Dict[str, Any] = {"variant": variant}
    if variant == "caesar":
        shift = rng.randint(1, 25)
        secret["shift"] = shift
        ciphertext = ciphers.caesar(plaintext, shift)
        common = ciphers.most_common_letter(ciphertext)
        public["free_hint"] = "Same shift on every letter, somewhere between 1 and 25."
        secret["hints"] = [
            f"{common} shows up most. In English that's usually E - try the shift that turns {common} into E.",
            f"First word: {first_word}.",
        ]
    elif variant == "atbash":
        ciphertext = ciphers.atbash(plaintext)
        public["free_hint"] = "Mirror alphabet. A swaps with Z, B with Y, and so on. Decoding is the same move."
        secret["hints"] = [f"First letter: {plaintext[0]}.", f"First word: {first_word}."]
    else:
        key_display = rng.choice(VIGENERE_KEYS[key_tier])
        key = key_display.replace(" ", "")
        secret["key"] = key_display
        ciphertext = ciphers.vigenere(plaintext, key)
        n = len(key)
        public["key_length"] = n
        public["free_hint"] = (
            f"The key is {n} letters. Letters 1, {n + 1}, {2 * n + 1}... (letters only) all use the same shift."
        )
        secret["hints"] = [f"Key starts with {key[0]}.", f"The key is {key_display}."]
    public["ciphertext"] = ciphertext
    return secret, public


@router.post("/cipher/rounds")
@limiter.limit(START_LIMIT)
async def start_cipher(request: Request, body: CipherStart, user=Depends(get_current_user)):
    variant = body.variant

    async def build(conn, level):
        recent = {
            r["p"] for r in await conn.fetch(
                """SELECT state->>'plaintext' AS p FROM game_rounds
                   WHERE user_id = $1 AND game_type IN ('cipher', 'daily')
                   ORDER BY started_at DESC LIMIT 40""",
                user["id"],
            )
        }
        bank = CIPHER_PHRASES[_cipher_tier(level)]
        plaintext = _rand.choice([p for p in bank if p not in recent] or bank)
        secret, public = build_cipher_puzzle(variant, plaintext, _rand, _vigenere_key_tier(level))
        limit = eco.CIPHER_TIME_LIMIT[variant]
        secret["time_limit"] = limit
        public.update({
            "time_limit": limit,
            "hints_available": len(secret["hints"]),
            "hint_penalty_pct": int(eco.CIPHER_HINT_PENALTY * 100),
        })
        return secret, public

    return await _start(user, "cipher", build, lambda s: s["time_limit"] + 60)


def _cipher_time_up(row) -> bool:
    return is_expired(row) or elapsed_seconds(row) > row["state"]["time_limit"] + 5


@router.post("/cipher/rounds/{round_id}/hint")
@limiter.limit(ACTION_LIMIT)
async def cipher_hint(request: Request, round_id: str, body: Optional[CipherHint] = None,
                      user=Depends(get_current_user)):
    async def handler(conn, row):
        state = row["state"]
        if _cipher_time_up(row):
            raise HTTPException(status_code=410, detail="Clock's out on this one.")
        used = state["hints_used"]
        if used >= len(state["hints"]):
            raise HTTPException(status_code=400, detail="That's every hint for this puzzle.")
        time_added = 0
        if body and body.reward_id:
            # The clock doesn't run while they watch: the video's time goes back on it.
            time_added = await ads.spend_reward(conn, user["id"], body.reward_id, "hint", row["id"])
            state["free_hints"] = state.get("free_hints", 0) + 1
            state["time_limit"] += time_added
            await conn.execute(
                "UPDATE game_rounds SET expires_at = expires_at + make_interval(secs => $2) WHERE id = $1",
                row["id"], float(time_added),
            )
        state["hints_used"] = used + 1
        await save_state(conn, row["id"], state)
        return {"hint": state["hints"][used], "hints_used": used + 1, "hints_remaining": len(state["hints"]) - used - 1,
                "time_added": time_added}

    return await _locked(request, round_id, user, "cipher", handler)


def score_cipher(variant: str, level: int, elapsed: float, time_limit: int, hints_used: int):
    lf = eco.level_factor(level)
    base = eco.CIPHER_BASE * eco.CIPHER_VARIANT_MULT[variant] * lf
    remaining = max(0.0, time_limit - elapsed) / time_limit
    time_bonus = int(base * eco.CIPHER_TIME_BONUS_MAX * remaining)
    hint_penalty = int(base * eco.CIPHER_HINT_PENALTY * hints_used)
    score = int(max(base * eco.CIPHER_FLOOR, base - hint_penalty)) + time_bonus
    return score, time_bonus, hint_penalty


def cipher_reveal(state) -> Dict[str, Any]:
    reveal = {"plaintext": state["plaintext"], "variant": state["variant"]}
    if "shift" in state:
        reveal["shift"] = state["shift"]
    if "key" in state:
        reveal["key"] = state["key"]
    return reveal


@router.post("/cipher/rounds/{round_id}/submit")
@limiter.limit(ACTION_LIMIT)
async def cipher_submit(request: Request, round_id: str, body: CipherAnswer, user=Depends(get_current_user)):
    async def handler(conn, row):
        state = row["state"]
        timed_out = _cipher_time_up(row)
        correct = (not timed_out) and ciphers.normalize_answer(body.answer) == state["plaintext"]
        if not correct:
            # A miss closes the round with no score and no progress.
            await conn.execute("UPDATE game_rounds SET completed_at = now() WHERE id = $1", row["id"])
            return {"correct": False, "timed_out": timed_out, **cipher_reveal(state), "score": 0,
                    "time_bonus": 0, "hint_penalty": 0, "passed": False, "new_achievements": [],
                    "game_progress": None, "overall_level_up": None}

        score, time_bonus, hint_penalty = score_cipher(
            state["variant"], row["level"], elapsed_seconds(row), state["time_limit"],
            state["hints_used"] - state.get("free_hints", 0),
        )
        extra = ["codebreaker"] if state["variant"] == "vigenere" else []
        result = await complete_round(conn, user["id"], row, score, extra, puzzle_solved=True)
        return {"correct": True, "timed_out": False, **cipher_reveal(state), "time_bonus": time_bonus,
                "hint_penalty": hint_penalty, **result}

    return await _locked(request, round_id, user, "cipher", handler)


def _cipher_view(row):
    state = row["state"]
    return {
        "time_left": max(0, int(state["time_limit"] - elapsed_seconds(row))),
        "hints_shown": state["hints"][: state["hints_used"]],
    }


# =============================================================================
# SECURITY QUIZ
# =============================================================================

QuizCategory = Literal["phishing", "social_engineering", "cryptography", "malware", "incident_response"]


class QuizStart(StrictModel):
    category: QuizCategory


class QuizAnswers(StrictModel):
    answers: List[int] = Field(min_length=1, max_length=eco.QUIZ_ROUND_SIZE)


@router.post("/quiz/rounds")
@limiter.limit(START_LIMIT)
async def start_quiz(request: Request, body: QuizStart, user=Depends(get_current_user)):
    async def build(conn, level):
        max_difficulty = min(3, 1 + (level - 1) // 2)
        bank = QUIZ_QUESTIONS[body.category]
        candidates = [i for i, q in enumerate(bank) if q["difficulty"] <= max_difficulty]
        chosen = _rand.sample(candidates, min(eco.QUIZ_ROUND_SIZE, len(candidates)))
        items, public = [], []
        for i, qid in enumerate(chosen):
            q = bank[qid]
            order = list(range(len(q["options"])))
            _rand.shuffle(order)
            items.append({"qid": qid, "order": order, "correct": order.index(0)})
            public.append({"index": i, "question": q["question"], "options": [q["options"][o] for o in order]})
        return (
            {"category": body.category, "items": items},
            {"category": body.category, "category_label": QUIZ_CATEGORY_LABELS[body.category], "questions": public},
        )

    return await _start(user, "quiz", build, 1800)


@router.post("/quiz/rounds/{round_id}/submit")
@limiter.limit(ACTION_LIMIT)
async def quiz_submit(request: Request, round_id: str, body: QuizAnswers, user=Depends(get_current_user)):
    async def handler(conn, row):
        state = row["state"]
        items = state["items"]
        if len(body.answers) != len(items):
            raise HTTPException(status_code=400, detail=f"Expected {len(items)} answers.")
        bank = QUIZ_QUESTIONS[state["category"]]
        results, correct_count = [], 0
        for i, (answer, item) in enumerate(zip(body.answers, items)):
            if not 0 <= answer < len(item["order"]):
                raise HTTPException(status_code=400, detail="Answer out of range.")
            ok = answer == item["correct"]
            correct_count += ok
            results.append({"index": i, "correct": ok, "your_answer": answer, "correct_answer": item["correct"],
                            "explanation": bank[item["qid"]]["explanation"]})
        total = len(items)
        perfect = correct_count == total
        score = int(round(correct_count * eco.QUIZ_PER_CORRECT * eco.level_factor(row["level"])))
        result = await complete_round(conn, user["id"], row, score, ["quiz_whiz"] if perfect else [],
                                      passed=correct_count / total >= eco.QUIZ_PASS_RATIO)
        return {"correct_count": correct_count, "total_questions": total,
                "percent": round(100 * correct_count / total), "results": results, **result}

    return await _locked(request, round_id, user, "quiz", handler)


# =============================================================================
# TRUE OR FALSE
# =============================================================================

class TrueFalseAnswer(StrictModel):
    index: int = Field(ge=0, le=50)
    answer: bool


def _balanced_statements(max_difficulty: int) -> List[int]:
    """Half true, half false, so 'always tap True' can't carry a round."""
    # Practice-only statements ship in the app with their answers, so they stay out of scored rounds.
    pool = [i for i, s in enumerate(TRUE_FALSE_STATEMENTS)
            if s["difficulty"] <= max_difficulty and i not in PRACTICE_TF_INDICES]
    trues = [i for i in pool if TRUE_FALSE_STATEMENTS[i]["answer"]]
    falses = [i for i in pool if not TRUE_FALSE_STATEMENTS[i]["answer"]]
    half = eco.TF_ROUND_SIZE // 2
    chosen = _rand.sample(trues, min(half, len(trues))) + _rand.sample(falses, min(half, len(falses)))
    _rand.shuffle(chosen)
    return chosen


@router.post("/truefalse/rounds")
@limiter.limit(START_LIMIT)
async def start_truefalse(request: Request, user=Depends(get_current_user)):
    async def build(conn, level):
        chosen = _balanced_statements(min(3, 1 + (level - 1) // 2))
        state = {"items": chosen, "answers": [], "streak": 0, "best_streak": 0, "points": 0}
        public = {"statements": [{"index": i, "statement": TRUE_FALSE_STATEMENTS[sid]["statement"]}
                                 for i, sid in enumerate(chosen)]}
        return state, public

    return await _start(user, "truefalse", build, 900)


@router.post("/truefalse/rounds/{round_id}/answer")
@limiter.limit(ACTION_LIMIT)
async def truefalse_answer(request: Request, round_id: str, body: TrueFalseAnswer, user=Depends(get_current_user)):
    async def handler(conn, row):
        if is_expired(row):
            raise HTTPException(status_code=410, detail="This round timed out.")
        state = row["state"]
        expected = len(state["answers"])
        if body.index != expected:
            raise HTTPException(status_code=400, detail=f"Answer statement {expected + 1} next.")
        statement = TRUE_FALSE_STATEMENTS[state["items"][expected]]
        ok = body.answer == statement["answer"]
        state["answers"].append(ok)
        state["streak"] = state["streak"] + 1 if ok else 0
        state["best_streak"] = max(state["best_streak"], state["streak"])
        points = 0
        if ok:
            mult = eco.tapered_multiplier(state["streak"], eco.TF_STREAK_FIRST_STEP, eco.TF_STREAK_CEILING)
            points = int(round(eco.TF_PER_CORRECT * eco.level_factor(row["level"]) * mult))
            state["points"] += points
        await save_state(conn, row["id"], state)
        response = {"correct": ok, "answer": statement["answer"], "explanation": statement["explanation"],
                    "streak": state["streak"], "points": points, "finished": False}
        if len(state["answers"]) < len(state["items"]):
            return response

        correct_count = sum(state["answers"])
        total = len(state["items"])
        perfect = correct_count == total
        result = await complete_round(conn, user["id"], row, state["points"], ["fact_checker"] if perfect else [],
                                      passed=correct_count / total >= eco.TF_PASS_RATIO)
        response.update({"finished": True, "result": {
            "correct_count": correct_count, "total_questions": total, "perfect": perfect,
            "best_streak": state["best_streak"], **result}})
        return response

    return await _locked(request, round_id, user, "truefalse", handler)


def _truefalse_view(row):
    state = row["state"]
    return {"answered": len(state["answers"]), "streak": state["streak"]}


# =============================================================================
# BINARY / HEX DECODER
# =============================================================================

class BinHexAnswer(StrictModel):
    index: int = Field(ge=0, le=20)
    answer: str = Field(default="", max_length=20)


def _binhex_tiers(level: int) -> List[int]:
    return [1] if level == 1 else [1, 2] if level <= 3 else [1, 2, 3]


def _binhex_public_item(i: int, word: str, fmt: str) -> Dict[str, Any]:
    label, tier, base = BINHEX_FORMATS[fmt]
    return {
        "index": i,
        "format": fmt,
        "label": label,
        "tier": tier,
        "base": base,
        "display": binhex_display(word, fmt),
        "codes": [encode_byte(ch, fmt) for ch in word],
    }


@router.post("/binhex/rounds")
@limiter.limit(START_LIMIT)
async def start_binhex(request: Request, user=Depends(get_current_user)):
    async def build(conn, level):
        tiers = _binhex_tiers(level)
        pool = [(w, f) for w, f in BINHEX_CHALLENGES if BINHEX_FORMATS[f][1] in tiers]
        chosen = _rand.sample(pool, eco.BINHEX_ROUND_SIZE)
        state = {"items": [{"word": w, "format": f} for w, f in chosen], "answers": [], "points": 0}
        public = {"items": [_binhex_public_item(i, w, f) for i, (w, f) in enumerate(chosen)]}
        return state, public

    return await _start(user, "binhex", build, 900)


@router.post("/binhex/rounds/{round_id}/answer")
@limiter.limit(ACTION_LIMIT)
async def binhex_answer(request: Request, round_id: str, body: BinHexAnswer, user=Depends(get_current_user)):
    async def handler(conn, row):
        if is_expired(row):
            raise HTTPException(status_code=410, detail="This round timed out.")
        state = row["state"]
        expected = len(state["answers"])
        if body.index != expected:
            raise HTTPException(status_code=400, detail=f"Decode word {expected + 1} next.")
        item = state["items"][expected]
        word, fmt = item["word"], item["format"]
        ok = ciphers.normalize_answer(body.answer).replace(" ", "") == word
        state["answers"].append(ok)
        points = 0
        if ok:
            tier = BINHEX_FORMATS[fmt][1]
            points = int(round(eco.BINHEX_PER_CORRECT * eco.BINHEX_TIER_MULT[tier] * eco.level_factor(row["level"])))
            state["points"] += points
        breakdown = [{"letter": ch, "decimal": ord(ch), "code": encode_byte(ch, fmt)} for ch in word]
        await save_state(conn, row["id"], state)
        response = {"correct": ok, "word": word, "breakdown": breakdown, "points": points, "finished": False}
        if len(state["answers"]) < len(state["items"]):
            return response

        correct_count = sum(state["answers"])
        total = len(state["items"])
        perfect = correct_count == total
        result = await complete_round(conn, user["id"], row, state["points"], ["binary_boss"] if perfect else [],
                                      puzzle_solved=perfect, passed=correct_count >= eco.BINHEX_PASS_CORRECT)
        response.update({"finished": True, "result": {
            "correct_count": correct_count, "total_questions": total, "perfect": perfect, **result}})
        return response

    return await _locked(request, round_id, user, "binhex", handler)


def _binhex_view(row):
    return {"answered": len(row["state"]["answers"])}


# =============================================================================
# MATCH-3 SECURITY
# =============================================================================

class Match3Swap(StrictModel):
    a: List[int] = Field(min_length=2, max_length=2)
    b: List[int] = Field(min_length=2, max_length=2)
    # The app can offer "+5 moves for a video": when it runs out, hold the round
    # open for that choice instead of ending it. Clients without ads leave it off.
    can_continue: bool = False


class Match3Continue(StrictModel):
    reward_id: str = Field(max_length=64)


@router.post("/match3/rounds")
@limiter.limit(START_LIMIT)
async def start_match3(request: Request, user=Depends(get_current_user)):
    async def build(conn, level):
        params = eco.match3_params(level)
        symbols = GAME_SYMBOLS[: params["num_symbols"]]
        seed = secrets.token_hex(16)
        board = match3_engine.generate_board(params["size"], symbols, match3_engine._rng(seed, "init"))
        state = {"seed": seed, "board": board, "symbols": symbols, "score": 0, "target": params["target"],
                 "moves_left": params["moves"], "move_no": 0}
        # The board ships with the start response; resume overrides it with the live board.
        public = {"board": board, "board_size": params["size"], "symbols": symbols,
                  "target_score": params["target"], "moves_allowed": params["moves"]}
        return state, public

    return await _start(user, "match3", build, 3600)


@router.post("/match3/rounds/{round_id}/swap")
@limiter.limit(ACTION_LIMIT)
async def match3_swap(request: Request, round_id: str, body: Match3Swap, user=Depends(get_current_user)):
    async def handler(conn, row):
        if is_expired(row):
            raise HTTPException(status_code=410, detail="This board timed out.")
        state = row["state"]
        if state.get("awaiting_continue"):
            raise HTTPException(status_code=409, detail="Out of moves. Take the extra moves or end the round.")
        board = state["board"]
        size = len(board)
        a, b = tuple(body.a), tuple(body.b)
        if not all(0 <= v < size for v in (*a, *b)) or not match3_engine.is_adjacent(a, b):
            raise HTTPException(status_code=400, detail="Swap two tiles that touch.")
        if not match3_engine.find_matches(match3_engine._swapped(board, a, b)):
            return {"valid": False, "board": board, "score": state["score"], "moves_left": state["moves_left"]}

        state["move_no"] += 1
        outcome = match3_engine.resolve_swap(board, a, b, state["symbols"], state["seed"], state["move_no"])
        state["board"] = outcome["board"]
        state["score"] += outcome["gained"]
        state["moves_left"] -= 1
        await save_state(conn, row["id"], state)

        response = {"valid": True, "steps": outcome["steps"], "board": outcome["board"],
                    "reshuffled": outcome["reshuffled"], "gained": outcome["gained"], "score": state["score"],
                    "moves_left": state["moves_left"], "finished": False}
        won = state["score"] >= state["target"]
        if not won and state["moves_left"] > 0:
            return response
        if not won and body.can_continue and not state.get("continued"):
            state["awaiting_continue"] = True
            await save_state(conn, row["id"], state)
            response.update({"out_of_moves": True, "continue_moves": ads.MATCH3_CONTINUE_MOVES})
            return response

        response.update({"finished": True, "result": await _finish_match3(conn, user, row, state, won)})
        return response

    return await _locked(request, round_id, user, "match3", handler)


async def _finish_match3(conn, user, row, state, won):
    efficiency_bonus = state["moves_left"] * eco.MATCH3_EFFICIENCY_PER_MOVE if won else 0
    # Match Master means winning with 5 moves to spare on the board's own moves.
    master = won and state["moves_left"] >= 5 and not state.get("continued")
    result = await complete_round(conn, user["id"], row, state["score"] + efficiency_bonus,
                                  ["match_master"] if master else [], passed=won)
    return {"won": won, "efficiency_bonus": efficiency_bonus, "moves_left": state["moves_left"],
            "final_score": result["score"], **result}


@router.post("/match3/rounds/{round_id}/continue")
@limiter.limit(ACTION_LIMIT)
async def match3_continue(request: Request, round_id: str, body: Match3Continue, user=Depends(get_current_user)):
    """+5 moves, once per round, paid for with a verified rewarded ad."""
    async def handler(conn, row):
        if is_expired(row):
            raise HTTPException(status_code=410, detail="This board timed out.")
        state = row["state"]
        if not state.get("awaiting_continue"):
            raise HTTPException(status_code=409, detail="There's nothing to continue.")
        await ads.spend_reward(conn, user["id"], body.reward_id, "continue", row["id"])
        state.update({"awaiting_continue": False, "continued": True,
                      "moves_left": state["moves_left"] + ads.MATCH3_CONTINUE_MOVES})
        await save_state(conn, row["id"], state)
        return {"board": state["board"], "score": state["score"], "moves_left": state["moves_left"]}

    return await _locked(request, round_id, user, "match3", handler)


@router.post("/match3/rounds/{round_id}/finish")
@limiter.limit(ACTION_LIMIT)
async def match3_finish(request: Request, round_id: str, user=Depends(get_current_user)):
    """Decline the extra moves: the round ends as it stood."""
    async def handler(conn, row):
        state = row["state"]
        if not state.get("awaiting_continue"):
            raise HTTPException(status_code=409, detail="This round is still going.")
        state["awaiting_continue"] = False
        await save_state(conn, row["id"], state)
        return {"finished": True, "result": await _finish_match3(conn, user, row, state, False)}

    return await _locked(request, round_id, user, "match3", handler)


def _match3_view(row):
    state = row["state"]
    return {"board": state["board"], "score": state["score"], "moves_left": state["moves_left"],
            "out_of_moves": bool(state.get("awaiting_continue"))}


# =============================================================================
# MEMORY LOCK
# =============================================================================

class MemoryFlip(StrictModel):
    index: int = Field(ge=0, le=47)


@router.post("/memory/rounds")
@limiter.limit(START_LIMIT)
async def start_memory(request: Request, user=Depends(get_current_user)):
    async def build(conn, level):
        pairs = eco.memory_pairs(level)
        deck = _rand.sample(GAME_SYMBOLS, pairs) * 2
        _rand.shuffle(deck)
        state = {"deck": deck, "matched": [], "pending": None, "moves": 0, "misses": 0}
        return state, {"pairs": pairs, "card_count": len(deck)}

    return await _start(user, "memory", build, 3600)


@router.post("/memory/rounds/{round_id}/flip")
@limiter.limit(ACTION_LIMIT)
async def memory_flip(request: Request, round_id: str, body: MemoryFlip, user=Depends(get_current_user)):
    async def handler(conn, row):
        if is_expired(row):
            raise HTTPException(status_code=410, detail="This board timed out.")
        state = row["state"]
        deck = state["deck"]
        idx = body.index
        if idx >= len(deck) or idx in state["matched"] or idx == state["pending"]:
            raise HTTPException(status_code=400, detail="That card's already face up.")

        symbol = deck[idx]
        if state["pending"] is None:
            state["pending"] = idx
            await save_state(conn, row["id"], state)
            return {"index": idx, "symbol": symbol, "pair_complete": False, "moves": state["moves"]}

        first = state["pending"]
        state["pending"] = None
        state["moves"] += 1
        match = deck[first] == symbol
        if match:
            state["matched"].extend([first, idx])
        else:
            state["misses"] += 1
        await save_state(conn, row["id"], state)

        response = {"index": idx, "symbol": symbol, "pair_complete": True, "first_index": first, "match": match,
                    "moves": state["moves"], "finished": False}
        if len(state["matched"]) < len(deck):
            return response

        pairs = len(deck) // 2
        misses = state["misses"]
        lf = eco.level_factor(row["level"])
        full = eco.MEMORY_PER_PAIR * pairs * lf
        score = int(round(max(full * eco.MEMORY_FLOOR, full - misses * eco.MEMORY_MISS_PENALTY * lf)))
        extra = (["memory_master"] if misses == 0 else []) + (["memory_maestro"] if misses <= 2 else [])
        result = await complete_round(conn, user["id"], row, score, extra, passed=misses <= pairs)
        response.update({"finished": True, "result": {
            "perfect": misses == 0, "misses": misses, "moves": state["moves"], **result}})
        return response

    return await _locked(request, round_id, user, "memory", handler)


def _memory_view(row):
    state = row["state"]
    deck = state["deck"]
    revealed = {str(i): deck[i] for i in state["matched"]}
    if state["pending"] is not None:
        revealed[str(state["pending"])] = deck[state["pending"]]
    return {"matched": state["matched"], "pending": state["pending"], "revealed": revealed, "moves": state["moves"]}


# =============================================================================
# SPEED CIPHER RUSH
# =============================================================================

class RushAnswer(StrictModel):
    answer: str = Field(default="", max_length=40)


def _rush_puzzle(level: int, solved: int, used: List[str]):
    length = min(8, 3 + solved // 3 + (level - 1) // 3)
    fresh = [w for w in RUSH_WORDS[length] if w not in used]
    word = _rand.choice(fresh or RUSH_WORDS[length])
    if solved < 3:
        kind, shift = "caesar", _rand.randint(1, 5)
    else:
        kind = _rand.choice(["caesar", "caesar", "atbash"])
        shift = _rand.randint(1, 25) if kind == "caesar" else None
    ciphertext = ciphers.caesar(word, shift) if kind == "caesar" else ciphers.atbash(word)
    return {"word": word, "kind": kind, "shift": shift}, {"ciphertext": ciphertext, "kind": kind, "shift": shift}


def _next_rush_puzzle(state, level: int) -> None:
    """Advance to a word not yet seen this run."""
    used = state.setdefault("used", [])
    state["puzzle"], state["public_puzzle"] = _rush_puzzle(level, state["solved"], used)
    used.append(state["puzzle"]["word"])


def rush_points(level: int, combo: int) -> int:
    mult = eco.tapered_multiplier(combo, eco.RUSH_COMBO_FIRST_STEP, eco.RUSH_COMBO_CEILING)
    return int(round(eco.RUSH_PER_WORD * eco.level_factor(level) * mult))


def _rush_dynamic(state, level: int):
    return {
        "puzzle": state["public_puzzle"],
        "score": state["score"],
        "combo": state["combo"],
        "next_points": rush_points(level, state["combo"] + 1),
        "multiplier": eco.tapered_multiplier(state["combo"] + 1, eco.RUSH_COMBO_FIRST_STEP, eco.RUSH_COMBO_CEILING),
        "solved": state["solved"],
    }


async def _finish_rush(conn, user, row, state):
    threshold = eco.rush_pass_threshold(row["level"])
    extra = ["rush_hour"] if state["solved"] >= 20 else []
    result = await complete_round(conn, user["id"], row, state["score"], extra, passed=state["solved"] >= threshold)
    return {"finished": True, "result": {"solved": state["solved"], "best_combo": state["best_combo"],
                                         "pass_threshold": threshold, **result}}


def _rush_time_up(row) -> bool:
    return elapsed_seconds(row) > eco.RUSH_DURATION + 2


@router.post("/rush/rounds")
@limiter.limit(START_LIMIT)
async def start_rush(request: Request, user=Depends(get_current_user)):
    async def build(conn, level):
        state = {"score": 0, "combo": 0, "best_combo": 0, "solved": 0, "used": []}
        _next_rush_puzzle(state, level)
        # Live fields are included here and overridden by _rush_view on resume.
        public = {"duration": eco.RUSH_DURATION, "pass_threshold": eco.rush_pass_threshold(level),
                  **_rush_dynamic(state, level)}
        return state, public

    return await _start(user, "rush", build, eco.RUSH_DURATION + 120)


@router.post("/rush/rounds/{round_id}/answer")
@limiter.limit(ACTION_LIMIT)
async def rush_answer(request: Request, round_id: str, body: RushAnswer, user=Depends(get_current_user)):
    async def handler(conn, row):
        state = row["state"]
        if _rush_time_up(row):
            return await _finish_rush(conn, user, row, state)
        ok = ciphers.normalize_answer(body.answer).replace(" ", "") == state["puzzle"]["word"]
        if not ok:
            state["combo"] = 0
            await save_state(conn, row["id"], state)
            return {"correct": False, "finished": False, **_rush_dynamic(state, row["level"])}

        state["combo"] += 1
        state["best_combo"] = max(state["best_combo"], state["combo"])
        points = rush_points(row["level"], state["combo"])
        state["score"] += points
        state["solved"] += 1
        solved_word = state["puzzle"]["word"]
        _next_rush_puzzle(state, row["level"])
        await save_state(conn, row["id"], state)
        return {"correct": True, "points": points, "solved_word": solved_word, "finished": False,
                **_rush_dynamic(state, row["level"])}

    return await _locked(request, round_id, user, "rush", handler)


@router.post("/rush/rounds/{round_id}/skip")
@limiter.limit(ACTION_LIMIT)
async def rush_skip(request: Request, round_id: str, user=Depends(get_current_user)):
    async def handler(conn, row):
        state = row["state"]
        if _rush_time_up(row):
            return await _finish_rush(conn, user, row, state)
        skipped = state["puzzle"]["word"]
        state["combo"] = 0
        _next_rush_puzzle(state, row["level"])
        await save_state(conn, row["id"], state)
        return {"skipped_word": skipped, "finished": False, **_rush_dynamic(state, row["level"])}

    return await _locked(request, round_id, user, "rush", handler)


@router.post("/rush/rounds/{round_id}/finish")
@limiter.limit(ACTION_LIMIT)
async def rush_finish(request: Request, round_id: str, user=Depends(get_current_user)):
    async def handler(conn, row):
        return await _finish_rush(conn, user, row, row["state"])

    return await _locked(request, round_id, user, "rush", handler)


def _rush_view(row):
    return {"time_left": max(0, int(eco.RUSH_DURATION - elapsed_seconds(row))),
            **_rush_dynamic(row["state"], row["level"])}


# =============================================================================
# RESUME
# =============================================================================

ACTIVE_VIEWS: Dict[str, Callable] = {
    "cipher": _cipher_view,
    "quiz": lambda row: {},
    "truefalse": _truefalse_view,
    "binhex": _binhex_view,
    "match3": _match3_view,
    "memory": _memory_view,
    "rush": _rush_view,
}


@router.get("/{game_type}/rounds/active")
async def active_round(game_type: str, user=Depends(get_current_user)):
    """The player's newest unfinished round for this mode, or {"round": null}."""
    if game_type not in GAME_TYPES:
        raise HTTPException(status_code=404, detail="Unknown game mode.")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT * FROM game_rounds
               WHERE user_id = $1 AND game_type = $2 AND completed_at IS NULL AND expires_at > now()
               ORDER BY started_at DESC LIMIT 1""",
            user["id"], game_type,
        )
    if not row or "public" not in row["state"]:
        return {"round": None}
    if (game_type == "cipher" and _cipher_time_up(row)) or (game_type == "rush" and _rush_time_up(row)):
        return {"round": None}
    view = {"round_id": str(row["id"]), "level": row["level"], "resumed": True,
            **row["state"]["public"], **ACTIVE_VIEWS[game_type](row)}
    return {"round": view}
