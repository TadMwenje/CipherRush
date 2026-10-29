import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { WALKTHROUGHS } from "./walkthroughs";
import HowToPlayModal from "../components/HowToPlayModal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = jest.fn(); // not in jsdom

const A = "A".charCodeAt(0);
const letters = (s) => [...s].map((c) => c.charCodeAt(0) - A);
const word = (ns) => ns.map((n) => String.fromCharCode(A + (((n % 26) + 26) % 26))).join("");
const row = (step, label) => step.demo.rows.find((r) => r.label === label).cells;
const step = (mode, title) => WALKTHROUGHS[mode].find((s) => s.title.startsWith(title));

// A tutorial that teaches a wrong decode is worse than none: check every example.
test("the Caesar, ROT-13 and Atbash examples decode as shown", () => {
  const caesar = step("cipher", "Caesar");
  expect(word(letters(row(caesar, "Cipher")).map((n) => n - 3))).toBe(row(caesar, "Plain"));
  const rot = step("rush", "The key");
  expect(word(letters(row(rot, "Cipher")).map((n) => n - 13))).toBe(row(rot, "Plain"));
  const atbash = step("cipher", "Atbash");
  expect(word(letters(row(atbash, "Cipher")).map((n) => 25 - n))).toBe(row(atbash, "Plain"));
});

test("the Vigenère example decodes with its key", () => {
  const vig = step("cipher", "Vigenère");
  const key = letters(row(vig, "Key"));
  expect(row(vig, "Key")).toBe(vig.demo.key.repeat(3).slice(0, row(vig, "Cipher").length));
  expect(word(letters(row(vig, "Cipher")).map((n, i) => n - key[i]))).toBe(row(vig, "Plain"));
});

test("the byte examples spell what they say", () => {
  for (const s of WALKTHROUGHS.binhex) {
    const plain = row(s, "Plain");
    const [first] = s.demo.rows;
    const radix = { Hex: 16, Binary: 2 }[first.label];
    const decoded = first.cells.map((c) => String.fromCharCode(parseInt(c.replace(/^0x/, ""), radix))).join("");
    expect(decoded).toBe(plain);
  }
});

test("a game's ? opens its walkthrough, and Next steps through it", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<HowToPlayModal focusKey="cipher" onClose={() => {}} />));
  expect(container.textContent).toContain("Step 1 of 4");
  expect(container.textContent).toContain("Quick rules");
  const next = [...container.querySelectorAll("button")].find((b) => b.textContent === "Next");
  act(() => next.click());
  expect(container.textContent).toContain("Atbash: the mirror alphabet");
  act(() => root.unmount());
});

test("modes without a walkthrough keep the plain rules sheet", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<HowToPlayModal focusKey="memory" onClose={() => {}} />));
  expect(container.querySelector(".walkthrough")).toBeNull();
  expect(container.textContent).toContain("Memory Lock");
  act(() => root.unmount());
});
