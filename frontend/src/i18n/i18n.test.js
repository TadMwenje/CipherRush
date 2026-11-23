import EN from "./en";
import { LANGUAGES, LOCALES, modeText, setLanguage, stepText, t, getLanguage } from ".";
import { GAME_MODES, DAILY_MODE } from "../constants/gameModes";
import { WALKTHROUGHS } from "../constants/walkthroughs";

const MODES = [...GAME_MODES, DAILY_MODE];
const STEPS = new Map(Object.values(WALKTHROUGHS).flat().map((s) => [s.id, s]));
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
