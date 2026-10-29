/*
 * Security Quiz hints: three free a round, then a rewarded video. The server
 * picks which option to strike out; the screen only shows what it's told.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import api from "../api";
import QuizGame from "./QuizGame";
import { earnReward } from "../ads/rewards";
import { adsAvailable } from "../ads/admob";

jest.mock("react-router-dom", () => ({ useNavigate: () => () => {} }), { virtual: true });
jest.mock("../ads/rewards", () => ({ earnReward: jest.fn() }));
jest.mock("../ads/admob", () => ({ adsAvailable: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const QUESTION = { index: 0, question: "Which is phishing?", options: ["A", "B", "C", "D"] };
const ROUND = { round_id: "r1", category: "phishing", questions: [QUESTION], free_hints_left: 3 };

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
  jest.restoreAllMocks();
});

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text));

async function renderWith(round, hintReply) {
  jest.spyOn(api, "get").mockImplementation(async (url) =>
    url.endsWith("/active") ? { data: { round } } : { data: { games: {} } }
  );
  const post = jest.spyOn(api, "post").mockResolvedValue({ data: hintReply });
  act(() => root.render(<QuizGame />));
  await flush();
  return post;
}

test("a free hint strikes out the option the server names", async () => {
  const post = await renderWith(ROUND, { question: 0, removed: { 0: [2] }, hints_used: 1, free_hints_left: 2 });
  expect(button("3 free left")).toBeTruthy();
  await act(async () => button("3 free left").click());
  expect(post).toHaveBeenCalledWith("/games/quiz/rounds/r1/hint", { question: 0 });
  const struck = container.querySelector(".option-btn.struck");
  expect(struck.textContent).toBe("C");
  expect(struck.disabled).toBe(true);
  expect(button("2 free left")).toBeTruthy();
});

test("after three, the next hint plays a video and sends its reward", async () => {
  adsAvailable.mockReturnValue(true);
  earnReward.mockResolvedValue("reward-9");
  const post = await renderWith(
    { ...ROUND, free_hints_left: 0 },
    { question: 0, removed: { 0: [1] }, hints_used: 4, free_hints_left: 0 }
  );
  await act(async () => button("watch a short video").click());
  expect(earnReward).toHaveBeenCalledWith("hint", "r1");
  expect(post).toHaveBeenCalledWith("/games/quiz/rounds/r1/hint", { question: 0, reward_id: "reward-9" });
});

test("without ads, used-up hints say so instead of offering a video", async () => {
  adsAvailable.mockReturnValue(false);
  await renderWith({ ...ROUND, free_hints_left: 0 }, {});
  expect(button("watch a short video")).toBeUndefined();
  expect(button("No free hints left").disabled).toBe(true);
});

test("no hint button once a question is down to two options", async () => {
  await renderWith({ ...ROUND, removed: { 0: [1, 3] }, free_hints_left: 1 }, {});
  expect(container.querySelectorAll(".option-btn.struck")).toHaveLength(2);
  expect(button("free left")).toBeUndefined();
});
