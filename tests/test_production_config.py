"""The production startup guard (render.yaml sets ENVIRONMENT=production)."""
from server import production_config_problems

GOOD = {
    "ENVIRONMENT": "production",
    "JWT_SECRET": "x" * 48,
    "COOKIE_SECURE": "true",
    "DATABASE_URL": "postgresql://u:p@db/cipherrush",
    "CORS_ORIGINS": "capacitor://localhost,https://localhost",
}


def test_good_production_config_passes():
    assert production_config_problems(GOOD) == []


def test_dev_is_not_checked():
    assert production_config_problems({"COOKIE_SECURE": "false"}) == []


def test_each_unsafe_setting_is_caught():
    for key, bad in [("JWT_SECRET", "short"), ("COOKIE_SECURE", "false"), ("DATABASE_URL", ""),
                     ("CORS_ORIGINS", "http://localhost:3000,capacitor://localhost")]:
        problems = production_config_problems({**GOOD, key: bad})
        assert len(problems) == 1 and key in problems[0], (key, problems)
