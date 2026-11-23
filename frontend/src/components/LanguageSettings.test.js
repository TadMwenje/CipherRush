import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import LanguageSettings from "./LanguageSettings";
import NavBar from "./NavBar";
import HowToPlayModal from "./HowToPlayModal";
import { setLanguage } from "../i18n";

// Jest can't resolve react-router 7's package exports here (see QuizGame.test.js).
jest.mock(
  "react-router-dom",
  () => ({ NavLink: ({ to, className, children }) => <a href={to} className={className({ isActive: false })}>{children}</a> }),
  { virtual: true }
);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
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

test("picking a language relabels the app at once and is remembered", () => {
  act(() =>
    root.render(
      <>
        <NavBar />
        <LanguageSettings />
      </>
    )
  );
  expect(container.querySelector(".bottom-nav").textContent).toContain("Home");
  const french = [...container.querySelectorAll(".language-btn")].find((b) => b.textContent === "Français");
  act(() => french.click());
  expect(container.querySelector(".bottom-nav").textContent).toContain("Accueil");
  expect(french.getAttribute("aria-checked")).toBe("true");
  expect(localStorage.getItem("cr_lang")).toBe("fr");
  expect(container.querySelector(".language-settings h2").textContent).toBe("Langue");
});

test("the walkthrough reads in the chosen language", () => {
  act(() => setLanguage("pl"));
  act(() => root.render(<HowToPlayModal focusKey="memory" onClose={() => {}} />));
  expect(container.textContent).toContain("Krok 1 z 3");
  expect(container.textContent).toContain("Odkryj dwie karty");
  expect(container.textContent).toContain("Krótkie zasady");
});
