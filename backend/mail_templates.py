"""The two transactional emails. Plain wording, a text part alongside the HTML,
inline styles only (mail clients strip <style>), and no tracking pixels."""
from html import escape

from mailer import Email

_BRAND = "#00a8cc"


def _layout(heading: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b2533;">
<tr><td style="padding:28px 28px 8px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:{_BRAND};">CipherRush</td></tr>
<tr><td style="padding:0 28px;"><h1 style="margin:8px 0 16px;font-size:21px;line-height:1.3;">{escape(heading)}</h1></td></tr>
<tr><td style="padding:0 28px 28px;font-size:15px;line-height:1.55;">{body_html}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7686;">
CipherRush is made by AximoIX. You got this email because of an action on your CipherRush account.
</p>
</td></tr>
</table>
</body>
</html>"""


def _button(url: str, label: str) -> str:
    return (f'<p style="margin:22px 0;"><a href="{escape(url)}" style="display:inline-block;background:{_BRAND};'
            f'color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">{escape(label)}</a></p>')


def verification_email(to: str, username: str, code: str, link: str, minutes: int) -> Email:
    html = _layout("Confirm your email", f"""
<p style="margin:0 0 12px;">Hi {escape(username)}, enter this code in CipherRush to confirm your email address:</p>
<p style="margin:18px 0;font-size:30px;font-weight:700;letter-spacing:8px;font-family:Menlo,Consolas,monospace;">{escape(code)}</p>
<p style="margin:0 0 4px;">Or confirm it with this button:</p>
{_button(link, "Confirm email")}
<p style="margin:0;color:#6b7686;font-size:13px;">The code and button work for {minutes} minutes. If you didn't make a CipherRush account, you can ignore this email.</p>
""")
    text = (f"Hi {username},\n\nYour CipherRush confirmation code is {code}\n\n"
            f"Or open this link to confirm your email:\n{link}\n\n"
            f"Both work for {minutes} minutes. If you didn't make a CipherRush account, ignore this email.\n")
    return Email(to=to, subject=f"Your CipherRush code: {code}", text=text, html=html)


def password_reset_email(to: str, username: str, link: str, minutes: int) -> Email:
    html = _layout("Reset your password", f"""
<p style="margin:0 0 12px;">Hi {escape(username)}, someone asked to reset the password for your CipherRush account.</p>
{_button(link, "Choose a new password")}
<p style="margin:0;color:#6b7686;font-size:13px;">The link works once, for {minutes} minutes. If this wasn't you, ignore this email; your password stays the same.</p>
""")
    text = (f"Hi {username},\n\nSomeone asked to reset the password for your CipherRush account. "
            f"Open this link to choose a new one:\n{link}\n\n"
            f"It works once, for {minutes} minutes. If this wasn't you, ignore this email; your password stays the same.\n")
    return Email(to=to, subject="Reset your CipherRush password", text=text, html=html)
