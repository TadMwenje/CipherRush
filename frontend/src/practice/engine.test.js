/*
 * Offline Practice Mode: generated and checked on the phone, never scored.
 */
const fs = require("fs");
const path = require("path");
import bank from "./bank.json";
import {
  atbash,
  caesar,
  checkCipher,
  cipherRound,
  normalizeAnswer,
  seededRng,
  trueFalseRound,
  TF_ROUND_SIZE,
} from "./engine";

test("caesar matches the server's convention and round-trips", () => {
  expect(caesar("HELLO WORLD", 3)).toBe("KHOOR ZRUOG");
  expect(caesar(caesar("ZERO DAY", 7), -7)).toBe("ZERO DAY");
});

test("atbash mirrors the alphabet and is its own inverse", () => {
  expect(atbash("ABC XYZ")).toBe("ZYX CBA");
  expect(atbash(atbash("PHISHING"))).toBe("PHISHING");
});

test("answers are normalised like the server does", () => {
  expect(normalizeAnswer("  zero,   day! ")).toBe("ZERO DAY");
});

test("the same seed gives the same rounds", () => {
  const a = seededRng(42);
  const b = seededRng(42);
  expect(cipherRound("caesar", a)).toEqual(cipherRound("caesar", b));
  expect(trueFalseRound(a)).toEqual(trueFalseRound(b));
});

test("cipher rounds decode back to their plaintext", () => {
  const rng = seededRng(7);
  for (let i = 0; i < 50; i++) {
    const caesarRound = cipherRound("caesar", rng);
    expect(caesarRound.shift).toBeGreaterThanOrEqual(1);
    expect(caesarRound.shift).toBeLessThanOrEqual(25);
    expect(caesar(caesarRound.ciphertext, -caesarRound.shift)).toBe(caesarRound.plaintext);
    expect(checkCipher(caesarRound, caesarRound.plaintext.toLowerCase())).toBe(true);
    const atbashRound = cipherRound("atbash", rng);
    expect(atbash(atbashRound.ciphertext)).toBe(atbashRound.plaintext);
    expect(checkCipher(atbashRound, "definitely wrong")).toBe(false);
  }
});

test("next cipher never repeats the one just played", () => {
  const rng = seededRng(3);
  let last = cipherRound("atbash", rng);
  for (let i = 0; i < 50; i++) {
    const next = cipherRound("atbash", rng, { avoid: last.plaintext });
    expect(next.plaintext).not.toBe(last.plaintext);
    last = next;
  }
});

test("true/false rounds are ten statements, five true and five false", () => {
  const rng = seededRng(99);
  for (let i = 0; i < 20; i++) {
    const deck = trueFalseRound(rng);
    expect(deck).toHaveLength(TF_ROUND_SIZE);
    expect(deck.filter((s) => s.answer)).toHaveLength(5);
    expect(new Set(deck.map((s) => s.statement)).size).toBe(TF_ROUND_SIZE);
  }
});

test("the bundled bank ships no scoring data", () => {
  bank.statements.forEach((s) => expect(Object.keys(s).sort()).toEqual(["answer", "explanation", "statement"]));
  bank.phrases.forEach((p) => expect(p).toMatch(/^[A-Z]+( [A-Z]+)*$/));
});

test("practice code never imports the API client, so it can't submit scores", () => {
  const files = [
    path.join(__dirname, "engine.js"),
    path.join(__dirname, "match3.js"),
    path.join(__dirname, "..", "games", "PracticeGame.js"),
    path.join(__dirname, "..", "games", "Match3Board.js"),
  ];
  files.forEach((file) => {
    const source = fs.readFileSync(file, "utf8");
    expect(source).not.toMatch(/from\s+["'][./]*api["']/);
    expect(source).not.toMatch(/\b(axios|fetch\(|XMLHttpRequest)\b/);
  });
});
