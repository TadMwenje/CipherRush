import EN from "./en";
import { LANGUAGES, LOCALES, modeText, setLanguage, stepText, t, getLanguage } from ".";
import { GAME_MODES, DAILY_MODE } from "../constants/gameModes";
import { WALKTHROUGHS } from "../constants/walkthroughs";

const MODES = [...GAME_MODES, DAILY_MODE];
const STEPS = new Map(
  Object.values(WALKTHROUGHS)
    .flat()
    .map((s) => [s.id, s]),
);
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join();

test("eight languages, each with a locale file except English", () => {
  expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "es", "fr", "de", "pt", "it", "nl", "pl"]);
  expect(Object.keys(LOCALES).sort()).toEqual(["de", "es", "fr", "it", "nl", "pl", "pt"]);
});

test("every walkthrough step has a unique id", () => {
  const all = Object.values(WALKTHROUGHS).flat();
  all.forEach((s) => expect(s.id).toBeTruthy());
  // Shared steps (Caesar etc.) are the same object, so ids map one-to-one.
  all.forEach((s) => expect(STEPS.get(s.id)).toBe(s));
});

describe.each(Object.entries(LOCALES))("%s", (code, locale) => {
  test("has every interface string, with the same {placeholders}", () => {
    expect(Object.keys(locale.ui).sort()).toEqual(Object.keys(EN).sort());
    for (const [key, en] of Object.entries(EN)) {
      expect(locale.ui[key].trim()).not.toBe("");
      expect([key, placeholders(locale.ui[key])]).toEqual([key, placeholders(en)]);
    }
  });

  test("names, taglines and rules for every mode", () => {
    expect(Object.keys(locale.modes).sort()).toEqual(MODES.map((m) => m.key).sort());
    for (const mode of MODES) {
      const tr = locale.modes[mode.key];
      expect(tr.label && tr.tagline).toBeTruthy();
      expect([mode.key, tr.rules.length]).toEqual([mode.key, mode.rules.length]);
    }
  });

  test("every walkthrough step, with a tip wherever English has one", () => {
    expect(Object.keys(locale.steps).sort()).toEqual([...STEPS.keys()].sort());
    for (const [id, step] of STEPS) {
      const tr = locale.steps[id];
      expect(tr.title && tr.body).toBeTruthy();
      expect([id, Boolean(tr.tip)]).toEqual([id, Boolean(step.tip)]);
    }
  });
});

test("lookups follow the chosen language and fall back to English", () => {
  const before = getLanguage();
  setLanguage("de");
  expect(t("nav.home")).toBe("Start");
  expect(t("dash.level", { n: 4 })).toBe("Level 4");
  expect(modeText(GAME_MODES[0]).label).toBe("Chiffre-Rätsel");
  expect(stepText(WALKTHROUGHS.cipher[0]).title).toMatch(/^Caesar/);
  expect(document.documentElement.lang).toBe("de");
  expect(localStorage.getItem("cr_lang")).toBe("de");
  expect(t("no.such.key")).toBe("no.such.key");
  setLanguage("xx"); // unsupported: ignored
  expect(getLanguage()).toBe("de");
  setLanguage("en");
  expect(t("nav.home")).toBe("Home");
  expect(modeText(GAME_MODES[0]).label).toBe(GAME_MODES[0].label);
  setLanguage(before);
});

test("dates read day month year, and numbers follow the language", () => {
  const { formatDate, formatNumber } = require("./index");
  expect(formatDate("2026-11-23T10:00:00Z", "en")).toBe("23 Nov 2026");
  expect(formatDate("", "en")).toBe("");
  expect(formatNumber(1234567, "en")).toBe("1,234,567");
  expect(formatNumber(1234567, "de")).toBe("1.234.567");
  expect(formatNumber(undefined, "en")).toBe("0");
});

test("rich() puts elements into a translated sentence", () => {
  const React = require("react");
  const { rich } = require("./index");
  const parts = rich("g.itSaid", { word: React.createElement("strong", null, "HELLO") }, "en");
  expect(parts[0]).toBe("It said ");
  expect(parts[1].type).toBe("strong");
  expect(parts[2]).toBe(".");
});

test("the handle messages exist in every language", () => {
  const { handleProblemKey, handleProblem } = require("../moderation/handle");
  expect(handleProblemKey("ad")).toBe("handle.shape");
  expect(handleProblemKey("ad0lf")).toBe("handle.taken");
  expect(handleProblemKey("godot")).toBe("");
  expect(handleProblem("adlof")).toBe("That username isn't available. Please choose another.");
});

test("cipher names and free hints follow the language", () => {
  const { freeHint, variantLabel } = require("../games/cipherText");
  const fr = (key, vars) => t(key, vars, "fr");
  expect(variantLabel("caesar", fr)).toBe("César");
  expect(variantLabel("vigenere", fr)).toBe("Vigenère");
  expect(freeHint({ variant: "caesar" }, fr)).toBe("Même décalage sur chaque lettre, entre 1 et 25.");
  expect(freeHint({ variant: "vigenere", key_length: 4 }, (k, v) => t(k, v, "en"))).toBe(
    "The key is 4 letters. Letters 1, 5, 9... (letters only) all use the same shift.",
  );
  expect(freeHint({ variant: "other", free_hint: "server text" }, fr)).toBe("server text");
});

test("modeText copes with a mode that has no rules (dashboard passes a slim copy)", () => {
  for (const lang of ["en", "fr"]) {
    const slim = { key: GAME_MODES[0].key, path: "/x", label: "Cipher" };
    expect(() => modeText(slim, lang)).not.toThrow();
    expect(modeText(slim, lang).rules).toEqual([]);
  }
});
