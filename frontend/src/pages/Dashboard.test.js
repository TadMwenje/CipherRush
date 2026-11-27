/*
 * Regression: the double-points offer opened from a game card crashed the
 * dashboard ("This screen hit a snag") because the card passes a slim mode
 * ({ key, path, label }) and the dialog asked modeText() for its rules.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Dashboard from "./Dashboard";
import { GAME_MODES } from "../constants/gameModes";
import { setLanguage } from "../i18n";

jest.mock("react-router-dom", () => ({ useNavigate: () => () => {}, Link: ({ children }) => children }), {
  virtual: true,
});
jest.mock("../AuthContext", () => ({ useAuth: () => ({ user: { id: "u1", handle: "tester" } }) }));
jest.mock("../cache", () => ({
  useCachedGet: () => ({ data: null, stale: false, refresh: () => () => {} }),
}));
jest.mock("../ads/admob", () => ({ initAds: () => Promise.resolve(false), adsAvailable: () => true }));
jest.mock("../ads/pacing", () => ({ shouldOfferBoost: () => true }));
jest.mock("../notifications", () => ({ syncDailyReminders: () => {} }));
jest.mock("../components/Reminders", () => ({ ReminderPrompt: () => null }));
jest.mock("../components/VerifyEmail", () => () => null);
jest.mock("../components/GamePreview", () => () => null);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  act(() => setLanguage("en"));
});

test.each(["en", "fr"])("tapping a game card opens the double-points offer without crashing (%s)", (lang) => {
  act(() => setLanguage(lang));
  act(() => root.render(<Dashboard />));
  const card = container.querySelector(".game-card-main");
  expect(card).toBeTruthy();
  act(() => card.click());
  const dialog = container.querySelector(".boost-dialog");
  expect(dialog).toBeTruthy();
  expect(dialog.querySelector("#boost-title").textContent.length).toBeGreaterThan(0);
  expect(GAME_MODES.length).toBeGreaterThan(0);
});
