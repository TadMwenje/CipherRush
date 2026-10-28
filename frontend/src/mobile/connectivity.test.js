/*
 * Network state transitions (online -> offline -> reconnected), the banner
 * state machine, and app background/resume. These are the paths behind the
 * "stuck on Reconnecting" and "frozen after switching apps" reports.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { NETWORK_EVENT } from "../api";
import { setNetworkState, isOnline, onNetworkChange, whenOnline, _resetNetworkForTests } from "./network";
import {
  enterBackground,
  enterForeground,
  onAppPause,
  onAppResume,
  isBackgrounded,
  _resetLifecycleForTests,
} from "./lifecycle";
import { useNetworkStatus } from "./hooks";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  _resetNetworkForTests(true);
  _resetLifecycleForTests();
});

describe("network state", () => {
  test("online -> offline -> reconnected notifies each change once", () => {
    const seen = [];
    onNetworkChange((s) => seen.push(s.online));
    setNetworkState(false);
    setNetworkState(false); // duplicate, ignored
    setNetworkState(true, "cellular");
    expect(seen).toEqual([false, true]);
    expect(isOnline()).toBe(true);
  });

  test("whenOnline resolves as soon as the signal is back", async () => {
    setNetworkState(false);
    const waiting = whenOnline(10000);
    setNetworkState(true, "wifi");
    await expect(waiting).resolves.toBe(true);
  });

  test("whenOnline gives up instead of waiting forever", async () => {
    jest.useFakeTimers();
    try {
      setNetworkState(false);
      const waiting = whenOnline(5000);
      jest.advanceTimersByTime(5000);
      await expect(waiting).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("connection banner status", () => {
  let container;
  let root;
  let latest;

  function Probe() {
    latest = useNetworkStatus();
    return null;
  }

  beforeEach(() => {
    container = document.createElement("div");
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });

  afterEach(() => act(() => root.unmount()));

  const api = (detail) => act(() => window.dispatchEvent(new CustomEvent(NETWORK_EVENT, { detail })));

  test("a request that gives up clears 'Reconnecting'", () => {
    api("retrying");
    expect(latest).toBe("retrying");
    api("failed");
    expect(latest).toBe("online");
  });

  test("a successful response clears 'Reconnecting'", () => {
    api("retrying");
    api("ok");
    expect(latest).toBe("online");
  });

  test("going offline and back follows the OS state", () => {
    act(() => setNetworkState(false));
    expect(latest).toBe("offline");
    api("retrying"); // stays offline - that's the more useful message
    expect(latest).toBe("offline");
    act(() => setNetworkState(true, "wifi"));
    expect(latest).toBe("online");
  });
});

describe("app lifecycle", () => {
  test("background pauses animations, resume reports time away", () => {
    const resumed = [];
    let paused = 0;
    onAppPause(() => paused++);
    onAppResume((e) => resumed.push(e.awayMs));

    enterBackground(1000);
    enterBackground(2000); // second source for the same event, ignored
    expect(isBackgrounded()).toBe(true);
    expect(document.documentElement.classList.contains("app-paused")).toBe(true);

    enterForeground(61000);
    enterForeground(62000); // ignored
    expect(paused).toBe(1);
    expect(resumed).toEqual([60000]);
    expect(document.documentElement.classList.contains("app-paused")).toBe(false);
  });

  test("resume without a pause does nothing", () => {
    const resumed = [];
    onAppResume((e) => resumed.push(e));
    enterForeground();
    expect(resumed).toEqual([]);
  });

  test("a throwing listener doesn't block the others", () => {
    let reached = false;
    onAppResume(() => {
      throw new Error("boom");
    });
    onAppResume(() => (reached = true));
    enterBackground(0);
    enterForeground(10);
    expect(reached).toBe(true);
  });
});
