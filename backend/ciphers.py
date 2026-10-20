"""Classical cipher and encoding primitives used by the puzzle modes."""
import re
from collections import Counter

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def normalize_answer(text: str) -> str:
    """Uppercase, letters only, single spaces - so 'hello,  world' == 'HELLO WORLD'."""
    return " ".join(re.sub(r"[^A-Z ]", " ", (text or "").upper()).split())


def caesar(text: str, shift: int) -> str:
    out = []
    for ch in text:
        if ch in ALPHABET:
            out.append(ALPHABET[(ALPHABET.index(ch) + shift) % 26])
        else:
            out.append(ch)
    return "".join(out)


def atbash(text: str) -> str:
    return "".join(ALPHABET[25 - ALPHABET.index(ch)] if ch in ALPHABET else ch for ch in text)


def vigenere(text: str, key: str) -> str:
    """Encrypt; the key advances only on letters so spaces don't consume key letters."""
    out, k = [], 0
    for ch in text:
        if ch in ALPHABET:
            shift = ALPHABET.index(key[k % len(key)])
            out.append(ALPHABET[(ALPHABET.index(ch) + shift) % 26])
            k += 1
        else:
            out.append(ch)
    return "".join(out)


def most_common_letter(text: str) -> str:
    letters = [c for c in text if c in ALPHABET]
    return Counter(letters).most_common(1)[0][0] if letters else "E"


def to_binary(word: str) -> str:
    return " ".join(format(ord(ch), "08b") for ch in word)


def to_hex(word: str) -> str:
    return " ".join(format(ord(ch), "02X") for ch in word)


def to_decimal(word: str) -> str:
    return " ".join(str(ord(ch)) for ch in word)
