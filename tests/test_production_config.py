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


def test_responses_are_gzipped_for_mobile_data():
    from starlette.middleware.gzip import GZipMiddleware
    import server

    assert any(m.cls is GZipMiddleware for m in server.app.user_middleware)


def test_api_docs_are_off_in_production():
    from server import docs_settings
    assert docs_settings({"ENVIRONMENT": "production"}) == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    assert docs_settings({}) == {}


def test_hsts_only_when_enabled():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from security import HSTS_VALUE, SecurityHeadersMiddleware

    def build(hsts):
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware, hsts=hsts)
        app.get("/x")(lambda: {"ok": True})
        return TestClient(app)

    on = build(True).get("/x").headers
    assert on["strict-transport-security"] == HSTS_VALUE
    assert on["x-frame-options"] == "DENY" and on["x-content-type-options"] == "nosniff"
    assert "strict-transport-security" not in build(False).get("/x").headers


def test_unexpected_errors_never_leak_details():
    from fastapi.testclient import TestClient
    import server

    path = "/__test_boom"

    async def boom():
        raise RuntimeError("asyncpg: relation users password_hash SELECT secret")

    server.app.add_api_route(path, boom)
    try:
        res = TestClient(server.app, raise_server_exceptions=False).get(path)
    finally:
        server.app.router.routes = [r for r in server.app.router.routes if getattr(r, "path", None) != path]
    assert res.status_code == 500
    assert res.json() == {"detail": "Something went wrong on our side. Try again."}
    assert "asyncpg" not in res.text and "Traceback" not in res.text
