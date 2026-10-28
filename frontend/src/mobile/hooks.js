import { useEffect, useRef, useState } from "react";
import { NETWORK_EVENT } from "../api";
import { isOnline, onNetworkChange } from "./network";
import { onAppResume } from "./lifecycle";

function readViewport() {
  const vv = window.visualViewport;
  const width = vv ? vv.width : window.innerWidth;
  const height = vv ? vv.height : window.innerHeight;
  return { width, height, landscape: width > height };
}

/** Live viewport size + orientation, including the on-screen keyboard (visualViewport). */
export function useViewport() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    let frame = null;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport(readViewport()));
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return viewport;
}

/** Measure an element's content box; re-measures on resize and rotation. */
export function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * "online" | "offline" | "retrying" - drives the connection banner.
 *
 * Connectivity comes from mobile/network (the OS, in the native app). The API
 * layer adds "retrying" while a dropped request is being retried, and always
 * reports how that ended: "ok" or "failed" both clear it, so the banner can't
 * get stuck on "Reconnecting" once the request has given up.
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState(isOnline() ? "online" : "offline");
  useEffect(() => {
    const fromNetwork = (s) => setStatus(s.online ? "online" : "offline");
    const fromApi = (e) => {
      if (e.detail === "retrying") setStatus((s) => (s === "offline" ? s : "retrying"));
      if (e.detail === "ok" || e.detail === "failed") setStatus(isOnline() ? "online" : "offline");
    };
    fromNetwork({ online: isOnline() });
    const off = onNetworkChange(fromNetwork);
    window.addEventListener(NETWORK_EVENT, fromApi);
    return () => {
      off();
      window.removeEventListener(NETWORK_EVENT, fromApi);
    };
  }, []);
  return status;
}

/** true while the phone has a connection. Re-renders on change. */
export function useOnline() {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    setOnline(isOnline());
    return onNetworkChange((s) => setOnline(s.online));
  }, []);
  return online;
}

/**
 * Re-run `load` when the connection comes back or the app returns to the
 * foreground, but only while the screen is mounted - nothing refreshes in the
 * background, and nothing is fetched while offline.
 */
export function useRefetchOnReturn(load) {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const again = () => isOnline() && loadRef.current();
    const offNet = onNetworkChange((s) => s.online && again());
    const offResume = onAppResume(again);
    return () => {
      offNet();
      offResume();
    };
  }, []);
}
