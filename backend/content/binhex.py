"""Binary/Hex Decoder challenge table.

Each entry is a word plus the real-world notation it's written in. The formats
are the ones you actually meet in logs, packet dumps, URLs and source code, so
players learn to read padding and prefixes, not just bare numbers.
"""

# format key -> (label shown to the player, tier, base, how one byte is written)
FORMATS = {
    "bin8": ("Binary, 8-bit padded", 1, 2),
    "hex": ("Hex bytes", 1, 16),
    "dec": ("Decimal ASCII", 1, 10),
    "hex0x": ("0x-prefixed hex", 2, 16),
    "nibble": ("Binary split into nibbles", 2, 2),
    "hexlower": ("Lowercase hex dump", 2, 16),
    "packed": ("Packed hex string", 2, 16),
    "bin7": ("7-bit binary, no padding", 3, 2),
    "escape": ("Escaped bytes, as in source code", 3, 16),
    "url": ("URL percent-encoding", 3, 16),
}


def encode_byte(ch: str, fmt: str) -> str:
    """How a single letter appears in the given notation."""
    code = ord(ch)
    if fmt == "bin8":
        return format(code, "08b")
    if fmt == "bin7":
        return format(code, "b")
    if fmt == "nibble":
        bits = format(code, "08b")
        return f"{bits[:4]} {bits[4:]}"
    if fmt == "dec":
        return str(code)
    if fmt == "hexlower":
        return format(code, "02x")
    if fmt == "hex0x":
        return "0x" + format(code, "02X")
    if fmt == "escape":
        return "\\x" + format(code, "02X")
    if fmt == "url":
        return "%" + format(code, "02X")
    return format(code, "02X")  # hex, packed


def display(word: str, fmt: str) -> str:
    """The full string as the player would see it in the wild."""
    parts = [encode_byte(ch, fmt) for ch in word]
    if fmt in ("escape", "url", "packed"):
        return "".join(parts)
    if fmt == "nibble":
        return "  ".join(parts)
    return " ".join(parts)


# 50 curated challenges: (word, format)
CHALLENGES = [
    # tier 1 - padded binary, plain hex, decimal
    ("KEY", "bin8"), ("BIT", "bin8"), ("PIN", "bin8"), ("LOG", "bin8"), ("BUG", "bin8"),
    ("HACK", "bin8"), ("NODE", "bin8"), ("ROOT", "bin8"),
    ("HEX", "hex"), ("DNS", "hex"), ("VPN", "hex"), ("LOCK", "hex"), ("CODE", "hex"),
    ("SAFE", "hex"), ("HASH", "hex"), ("PING", "hex"),
    ("ZIP", "dec"), ("LAN", "dec"), ("SALT", "dec"), ("PORT", "dec"), ("DATA", "dec"), ("WORM", "dec"),
    # tier 2 - prefixes, nibbles, lowercase dumps, packed strings
    ("BYTE", "hex0x"), ("SCAN", "hex0x"), ("TOKEN", "hex0x"), ("PROXY", "hex0x"),
    ("WIFI", "nibble"), ("SPAM", "nibble"), ("LEAK", "nibble"), ("ALERT", "nibble"),
    ("CYBER", "hexlower"), ("LOGIN", "hexlower"), ("PATCH", "hexlower"), ("GUARD", "hexlower"),
    ("SHELL", "packed"), ("CRYPT", "packed"), ("AUDIT", "packed"), ("VIRUS", "packed"),
    # tier 3 - unpadded 7-bit, escaped bytes, URL encoding
    ("SPOOF", "bin7"), ("ADMIN", "bin7"), ("FRAUD", "bin7"), ("CLOUD", "bin7"),
    ("ROTOR", "escape"), ("NONCE", "escape"), ("CACHE", "escape"), ("BOMBE", "escape"),
    ("STACK", "url"), ("SEED", "url"), ("PEER", "url"), ("PATH", "url"),
]
