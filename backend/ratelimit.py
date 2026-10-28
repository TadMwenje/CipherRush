import os

from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request) -> str:
    """The player's IP, for per-IP rate limits.

    Behind Cloudflare (api.aximoix.com is proxied, and onrender.com itself sits
    on Cloudflare) the connecting address is a Cloudflare edge shared by many
    players, so limits keyed on it would lock everyone out together. Cloudflare
    overwrites CF-Connecting-IP with the real visitor address on every request,
    so it can't be spoofed through Cloudflare. It's only trusted when
    TRUST_CF_CONNECTING_IP=true (set in render.yaml); anywhere else a client
    could send the header itself.
    """
    if os.environ.get("TRUST_CF_CONNECTING_IP", "").lower() == "true":
        forwarded = request.headers.get("cf-connecting-ip", "").strip()
        if forwarded:
            return forwarded
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
