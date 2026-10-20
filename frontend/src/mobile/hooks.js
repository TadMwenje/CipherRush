import { useEffect, useState } from "react";
import { NETWORK_EVENT } from "../api";

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

/** "online" | "offline" | "retrying" - drives the connection banner. */
export function useNetworkStatus() {
  const [status, setStatus] = useState(navigator.onLine === false ? "offline" : "online");
  useEffect(() => {
    const online = () => setStatus("online");
    const offline = () => setStatus("offline");
    const fromApi = (e) => {
      if (e.detail === "retrying") setStatus((s) => (s === "offline" ? s : "retrying"));
      if (e.detail === "ok") setStatus("online");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener(NETWORK_EVENT, fromApi);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener(NETWORK_EVENT, fromApi);
    };
  }, []);
  return status;
}
