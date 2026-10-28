"""Write the offline Practice Mode bank into the app.

    backend/.venv/bin/python backend/scripts/export_practice_bank.py

Exports only the practice slice of the content banks (see
content.is_practice_item). Scored rounds never use these items, so shipping
their answers in the app bundle gives nothing away. Re-run after editing the
banks; tests/test_practice_bank.py fails while the app's copy is stale.
"""
import json
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from content import PRACTICE_PHRASES, PRACTICE_TF_INDICES, TRUE_FALSE_STATEMENTS  # noqa: E402

OUT = BACKEND.parent / "frontend" / "src" / "practice" / "bank.json"


def build_bank() -> dict:
    return {
        "phrases": sorted(PRACTICE_PHRASES),
        "statements": [
            {"statement": s["statement"], "answer": s["answer"], "explanation": s["explanation"]}
            for i, s in enumerate(TRUE_FALSE_STATEMENTS)
            if i in PRACTICE_TF_INDICES
        ],
    }


def render() -> str:
    return json.dumps(build_bank(), indent=1, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    OUT.write_text(render(), encoding="utf-8")
    print(f"wrote {OUT.relative_to(BACKEND.parent)}")
