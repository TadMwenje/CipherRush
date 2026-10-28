"""Offline Practice Mode ships its own slice of content inside the app.

Regression guards: practice items (whose answers are public in the bundle)
never appear in scored rounds, and the app's copy of the bank is current.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend" / "scripts"))

import export_practice_bank  # noqa: E402
from content import CIPHER_PHRASES, PRACTICE_PHRASES, PRACTICE_TF_INDICES, TRUE_FALSE_STATEMENTS  # noqa: E402
import game_routes  # noqa: E402

BANK_FILE = ROOT / "frontend" / "src" / "practice" / "bank.json"


def test_app_bank_is_current():
    assert BANK_FILE.read_text(encoding="utf-8") == export_practice_bank.render(), (
        "frontend/src/practice/bank.json is stale - run backend/scripts/export_practice_bank.py"
    )


def test_bank_has_enough_for_a_balanced_round():
    bank = json.loads(BANK_FILE.read_text(encoding="utf-8"))
    trues = [s for s in bank["statements"] if s["answer"]]
    falses = [s for s in bank["statements"] if not s["answer"]]
    assert len(trues) >= 10 and len(falses) >= 10
    assert len(bank["phrases"]) >= 30


def test_practice_phrases_never_used_in_scored_ciphers():
    scored = {p for tier in CIPHER_PHRASES.values() for p in tier}
    assert scored and not scored & set(PRACTICE_PHRASES)


def test_practice_statements_never_dealt_in_scored_rounds():
    for difficulty in (1, 2, 3):
        for _ in range(50):
            chosen = game_routes._balanced_statements(difficulty)
            assert len(chosen) == 10
            assert not set(chosen) & PRACTICE_TF_INDICES


def test_app_bank_contains_only_practice_items():
    bank = json.loads(BANK_FILE.read_text(encoding="utf-8"))
    practice_statements = {TRUE_FALSE_STATEMENTS[i]["statement"] for i in PRACTICE_TF_INDICES}
    assert {s["statement"] for s in bank["statements"]} == practice_statements
    assert set(bank["phrases"]) == set(PRACTICE_PHRASES)


def test_true_false_round_over_http_avoids_practice_items(player):
    data = player.post("/api/games/truefalse/rounds").json()
    dealt = {s["statement"] for s in data["statements"]}
    practice_statements = {TRUE_FALSE_STATEMENTS[i]["statement"] for i in PRACTICE_TF_INDICES}
    assert dealt and not dealt & practice_statements
