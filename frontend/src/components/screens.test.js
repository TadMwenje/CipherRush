/*
 * Route resilience: a crashing screen shows a recoverable error instead of
 * blanking the app, and live screens (Versus, Ranks) stay quiet offline.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import api from "../api";
import ScreenBoundary from "./ScreenBoundary";
import Battle from "../pages/Battle";
import PracticeGame from "../games/PracticeGame";
import { setNetworkState, _resetNetworkForTests } from "../mobile/network";

// react-router 7 ships only ESM exports Jest 27 can't resolve; the boundary just needs Link.
jest.mock(
  "react-router-dom",
  () => ({ Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>, useNavigate: () => () => {} }),
  { virtual: true }
);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

beforeEach(() => {
  _resetNetworkForTests(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

function Boom() {
  throw new Error("render failed");
}

test("a crashing screen shows a retry screen, not a blank page", () => {
  const logged = jest.spyOn(console, "error").mockImplementation(() => {});
  act(() =>
    root.render(
      <ScreenBoundary title="Versus didn't load">
        <Boom />
      </ScreenBoundary>
    )
  );
  expect(container.textContent).toContain("Versus didn't load");
  expect(container.textContent).toContain("Try again");
  // The native consoles get one string with the full stack, tagged for filtering.
  const line = logged.mock.calls.map((c) => c[0]).find((m) => typeof m === "string" && m.startsWith("[CipherRush]"));
  expect(line).toMatch(/render failed/);
  expect(line).toMatch(/at Boom/);
  expect(line).toMatch(/Component stack:/);
});

test("Versus makes no request while offline and says why", async () => {
  const get = jest.spyOn(api, "get");
  setNetworkState(false);
  act(() => root.render(<Battle />));
  await flush();
  expect(get).not.toHaveBeenCalled();
  expect(container.textContent).toContain("needs a connection");
});

test("Versus loads once the connection comes back", async () => {
  const get = jest.spyOn(api, "get").mockResolvedValue({ data: { queue: [{ username: "neo", level: 3, score: 1200 }] } });
  setNetworkState(false);
  act(() => root.render(<Battle />));
  await flush();
  act(() => setNetworkState(true, "wifi"));
  await flush();
  expect(get).toHaveBeenCalledWith("/battle/queue");
  expect(container.textContent).toContain("neo");
});

test("Versus survives a malformed response", async () => {
  jest.spyOn(api, "get").mockResolvedValue({ data: "<html>" });
  act(() => root.render(<Battle />));
  await flush();
  expect(container.textContent).toContain("Couldn't reach Versus");
});

test("Practice works offline, says it's unscored, and never calls the API", async () => {
  const get = jest.spyOn(api, "get");
  const post = jest.spyOn(api, "post");
  setNetworkState(false);
  act(() => root.render(<PracticeGame />));
  await flush();
  expect(container.textContent).toContain("Practice Mode (Offline) — Scores and XP are disabled while offline.");
  expect(container.querySelector(".encrypted-text").textContent).toMatch(/^[A-Z ]+$/);

  const [, , tfTab] = container.querySelectorAll(".segmented-btn");
  act(() => tfTab.click());
  act(() => container.querySelector(".binary-choice.true").click());
  expect(container.querySelector(".binary-feedback")).not.toBeNull();

  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

test("Practice online still says it's unscored", () => {
  act(() => root.render(<PracticeGame />));
  expect(container.textContent).toContain("Practice Mode — unscored");
});
