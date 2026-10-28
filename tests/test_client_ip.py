"""Rate-limit key: the real player IP behind Cloudflare, never a spoofable header elsewhere."""
from starlette.requests import Request

from ratelimit import client_ip


def make_request(headers=None, peer="10.0.0.1"):
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": (peer, 1234)})


def test_uses_peer_address_by_default(monkeypatch):
    monkeypatch.delenv("TRUST_CF_CONNECTING_IP", raising=False)
    assert client_ip(make_request({"CF-Connecting-IP": "6.6.6.6"})) == "10.0.0.1"


def test_uses_cloudflare_visitor_ip_when_trusted(monkeypatch):
    monkeypatch.setenv("TRUST_CF_CONNECTING_IP", "true")
    assert client_ip(make_request({"CF-Connecting-IP": "203.0.113.9"})) == "203.0.113.9"


def test_falls_back_when_header_missing(monkeypatch):
    monkeypatch.setenv("TRUST_CF_CONNECTING_IP", "true")
    assert client_ip(make_request()) == "10.0.0.1"
