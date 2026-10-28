/*
 * Offline Practice Mode: Caesar, Atbash and True/False, generated and checked
 * entirely on the phone from a local seed.
 *
 * Unscored by design. This module never touches the API: scores, XP, levels
 * and leaderboards are server-authoritative and come only from server rounds.
 * The bank is the practice slice of the server's content, which scored rounds
 * never use (backend/content: is_practice_item), so shipping these answers
 * gives nothing away. Regenerate it with backend/scripts/export_practice_bank.py.
 */
import bank from "./bank.json";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const TF_ROUND_SIZE = 10;

/** Same rule as the server: uppercase, letters only, single spaces. */
export function normalizeAnswer(text) {
  return (text || "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function caesar(text, shift) {
  return [...text].map((ch) => {
    const i = ALPHABET.indexOf(ch);
    return i < 0 ? ch : ALPHABET[(((i + shift) % 26) + 26) % 26];
  }).join("");
}

export function atbash(text) {
  return [...text].map((ch) => {
    const i = ALPHABET.indexOf(ch);
    return i < 0 ? ch : ALPHABET[25 - i];
  }).join("");
}

/** A fresh 32-bit seed from the OS RNG (Math.random as a last resort). */
export function newSeed() {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

/** mulberry32: small, fast, deterministic per seed. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One cipher to crack. `avoid` skips the phrase just played. */
export function cipherRound(variant, rng, { avoid = null, phrases = bank.phrases } = {}) {
  const pool = phrases.length > 1 && avoid ? phrases.filter((p) => p !== avoid) : phrases;
  const plaintext = pick(rng, pool);
  if (variant === "atbash") {
    return { variant, plaintext, ciphertext: atbash(plaintext), shift: null };
  }
  const shift = 1 + Math.floor(rng() * 25);
  return { variant: "caesar", plaintext, ciphertext: caesar(plaintext, shift), shift };
}

export function checkCipher(round, answer) {
  return normalizeAnswer(answer) === normalizeAnswer(round.plaintext);
}

/** Ten statements, always five true and five false, like the scored mode. */
export function trueFalseRound(rng, { statements = bank.statements, size = TF_ROUND_SIZE } = {}) {
  const half = Math.floor(size / 2);
  const trues = shuffle(rng, statements.filter((s) => s.answer)).slice(0, half);
  const falses = shuffle(rng, statements.filter((s) => !s.answer)).slice(0, half);
  return shuffle(rng, [...trues, ...falses]);
}
