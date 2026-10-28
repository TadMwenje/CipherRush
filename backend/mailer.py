"""Transactional email: account verification and password resets.

Backends, picked by MAIL_BACKEND (or automatically from what's configured):
  * zeptomail - Zoho ZeptoMail's HTTPS API (ZEPTOMAIL_API_KEY). The one to use
    on Render's free plan, which blocks outbound SMTP ports.
  * smtp      - any SMTP server, e.g. smtppro.zoho.com:465 (SMTP_HOST, SMTP_PORT,
    SMTP_USER, SMTP_PASS). Port 465 is implicit TLS; any other port uses STARTTLS.
  * log       - nothing is sent; a line is logged without the code or link.
    The default when nothing is configured, so sign-up still works.
  * memory    - kept in `outbox` for the test suite.

Credentials only ever come from the environment (Render dashboard), never git.
"""
import asyncio
import logging
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from typing import List

import httpx

logger = logging.getLogger(__name__)

DEFAULT_FROM_ADDRESS = "support@aximoix.com"
DEFAULT_FROM_NAME = "CipherRush Security"
ZEPTOMAIL_URL = "https://api.zeptomail.com/v1.1/email"
SEND_TIMEOUT_SECONDS = 15


@dataclass
class Email:
    to: str
    subject: str
    text: str
    html: str


outbox: List[Email] = []


def backend() -> str:
    chosen = os.environ.get("MAIL_BACKEND", "").strip().lower()
    if chosen:
        return chosen
    if os.environ.get("ZEPTOMAIL_API_KEY"):
        return "zeptomail"
    if os.environ.get("SMTP_HOST"):
        return "smtp"
    return "log"


def _sender():
    return (os.environ.get("MAIL_FROM_NAME", DEFAULT_FROM_NAME),
            os.environ.get("MAIL_FROM_ADDRESS", DEFAULT_FROM_ADDRESS))


async def _send_zeptomail(mail: Email) -> None:
    name, address = _sender()
    key = os.environ["ZEPTOMAIL_API_KEY"].strip()
    # The dashboard shows the key with its "Zoho-enczapikey " prefix; accept either form.
    if not key.lower().startswith("zoho-enczapikey"):
        key = f"Zoho-enczapikey {key}"
    async with httpx.AsyncClient(timeout=SEND_TIMEOUT_SECONDS) as client:
        res = await client.post(
            os.environ.get("ZEPTOMAIL_API_URL", ZEPTOMAIL_URL),
            headers={"Authorization": key, "Accept": "application/json"},
            json={
                "from": {"address": address, "name": name},
                "to": [{"email_address": {"address": mail.to}}],
                "subject": mail.subject,
                "textbody": mail.text,
                "htmlbody": mail.html,
                "track_clicks": False,
                "track_opens": False,
            },
        )
    if res.status_code >= 300:
        raise RuntimeError(f"ZeptoMail returned {res.status_code}: {res.text[:300]}")


def _send_smtp_sync(mail: Email) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "465"))
    msg = EmailMessage()
    msg["From"] = formataddr(_sender())
    msg["To"] = mail.to
    msg["Subject"] = mail.subject
    msg.set_content(mail.text)
    msg.add_alternative(mail.html, subtype="html")
    context = ssl.create_default_context()
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=SEND_TIMEOUT_SECONDS, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=SEND_TIMEOUT_SECONDS)
        server.starttls(context=context)
    with server:
        server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
        server.send_message(msg)


async def send(mail: Email) -> bool:
    """Send one email. Never raises: a mail outage mustn't break sign-up."""
    kind = backend()
    try:
        if kind == "memory":
            outbox.append(mail)
        elif kind == "zeptomail":
            await _send_zeptomail(mail)
        elif kind == "smtp":
            await asyncio.to_thread(_send_smtp_sync, mail)
        else:
            logger.warning("Email not sent (no mail backend configured): %r", mail.subject)
            return False
        return True
    except Exception:  # noqa: BLE001 - logged and reported, never surfaced to the player
        logger.exception("Sending %r failed via %s", mail.subject, kind)
        return False
