"""Handle moderation: slurs, hate pairs, profanity and the usual bypasses are
refused; ordinary handles that merely contain those letters are not."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from moderation import ValidationError, validate_username  # noqa: E402

BLOCKED = [
    "white_pig", "blackpig", "Wh1te_P1g", "pig_white", "black__monkey", "asian_ape", "jew_rat", "gay_scum",
    "fuuuuck_you", "n1gg3r", "niiigger", "sp1c", "coon", "paki_99", "h1tl3r", "whitepower", "the_1488",
    "kill_all_jews", "a55ho1e", "admin", "CipherRush_dev",
]
ALLOWED = [
    "tadiwa_mwenje", "grapefruit", "therapist_tom", "spicy_cipher", "raccoon", "crisis_ops", "torpedo",
    "black_cat", "white_hat", "red_team", "snow_white", "coonhound_fan", "pakistan_fan", "jewel",
    "homeland", "scunthorpe", "blackhat_42", "shiitake", "assassin",
]


@pytest.mark.parametrize("handle", BLOCKED)
def test_offensive_handles_are_refused(handle):
    with pytest.raises(ValidationError):
        validate_username(handle)


@pytest.mark.parametrize("handle", ALLOWED)
def test_ordinary_handles_pass(handle):
    assert validate_username(handle) == handle.lower()


def test_app_copy_of_the_blocklist_is_identical():
    server = json.loads((ROOT / "backend" / "content" / "handle_blocklist.json").read_text(encoding="utf-8"))
    app = json.loads((ROOT / "frontend" / "src" / "moderation" / "handleBlocklist.json").read_text(encoding="utf-8"))
    assert app == server, "copy backend/content/handle_blocklist.json to frontend/src/moderation/handleBlocklist.json"


def test_rename_to_an_offensive_handle_is_refused_over_http(player):
    res = player.post("/api/me/username", json={"username": "wh1te_p1g"})
    assert res.status_code == 400
