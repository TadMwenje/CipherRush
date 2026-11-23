import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import api from "./api";
import { clearCache, readCache, useCachedGet, writeCache } from "./cache";
import { AuthProvider, useAuth } from "./AuthContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  jest.restoreAllMocks();
});
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

test("entries are scoped per account and wiped by clearCache", () => {
  writeCache("alice", "/me/profile", { username: "alice" });
  expect(readCache("alice", "/me/profile")).toEqual({ username: "alice" });
  expect(readCache("bob", "/me/profile")).toBeNull();
  localStorage.setItem("unrelated", "keep me");
  clearCache();
  expect(readCache("alice", "/me/profile")).toBeNull();
  expect(localStorage.getItem("unrelated")).toBe("keep me");
});

test("week-old entries are ignored", () => {
  writeCache("alice", "/daily", { played: true });
  const key = Object.keys(localStorage).find((k) => k.includes("/daily"));
  localStorage.setItem(key, JSON.stringify({ at: Date.now() - 8 * 24 * 3600 * 1000, data: { played: true } }));
  expect(readCache("alice", "/daily")).toBeNull();
});

function Board() {
  const { data, stale } = useCachedGet("/leaderboard", { accept: (d) => Array.isArray(d?.leaderboard) });
  return <div>{data ? `${data.leaderboard.length} rows${stale ? " (cached)" : ""}` : "empty"}</div>;
}

test("shows the cached copy at once, then the server's", async () => {
  writeCache(null, "/leaderboard", { leaderboard: [{ rank: 1 }] });
  let answer;
  jest.spyOn(api, "get").mockReturnValue(new Promise((r) => (answer = r)));
  act(() => root.render(<Board />));
  expect(container.textContent).toBe("1 rows (cached)");
  await act(async () => answer({ data: { leaderboard: [{ rank: 1 }, { rank: 2 }] } }));
  expect(container.textContent).toBe("2 rows");
  expect(readCache(null, "/leaderboard").leaderboard).toHaveLength(2);
});

test("a malformed answer doesn't replace a good cached copy", async () => {
  writeCache(null, "/leaderboard", { leaderboard: [{ rank: 1 }] });
  jest.spyOn(api, "get").mockResolvedValue({ data: { oops: true } });
  act(() => root.render(<Board />));
  await flush();
  expect(container.textContent).toBe("1 rows (cached)");
});

function Who() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : user ? user.username : "signed out"}</div>;
}

test("a returning player sees their cached session at once; a 401 signs them out and wipes it", async () => {
  writeCache("session", "/auth/me", { id: "u1", username: "alice" });
  writeCache("u1", "/me/dashboard", { level: 3 });
  let answer;
  jest.spyOn(api, "get").mockReturnValue(new Promise((_, reject) => (answer = reject)));
  act(() => root.render(<AuthProvider><Who /></AuthProvider>));
  expect(container.textContent).toBe("alice"); // no splash wait
  await act(async () => answer({ response: { status: 401 } }));
  expect(container.textContent).toBe("signed out");
  expect(readCache("u1", "/me/dashboard")).toBeNull();
});

test("no signal at launch keeps the cached player", async () => {
  writeCache("session", "/auth/me", { id: "u1", username: "alice" });
  jest.spyOn(api, "get").mockRejectedValue(new Error("Network Error"));
  act(() => root.render(<AuthProvider><Who /></AuthProvider>));
  await flush();
  expect(container.textContent).toBe("alice");
});
