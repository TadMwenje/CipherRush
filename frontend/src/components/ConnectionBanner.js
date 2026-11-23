import React, { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { SignalOff, Signal } from "../glyphs";
import { useNetworkStatus } from "../mobile/hooks";
import { useT } from "../i18n";

// Space kept under the banner, on top of its own height.
const GAP = 8;

// Scored rounds live on the server and pick up when the signal's back; every
// other screen is showing the copy cache.js kept from last time.
const inRound = (path) => path.startsWith("/game/");

/**
 * Pinned under the status bar while the phone has no connection, or while
 * we're retrying a request that dropped mid-flight (e.g. Wi-Fi to cellular).
 * It pushes the screen down (--banner-space) rather than covering its title.
 */
function ConnectionBanner() {
  const status = useNetworkStatus();
  const { pathname } = useLocation();
  const t = useT();
  const visible = status !== "online";
  const ref = useRef(null);
  const offline = status === "offline";
  let text = t("net.reconnecting");
  if (offline) text = inRound(pathname) ? t("net.offlineRound") : t("net.offline");

  // Reserve exactly the banner's height (one line in English, two in some
  // languages), and follow it if it changes.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!visible || !el) {
      root.style.setProperty("--banner-space", "0px");
      return undefined;
    }
    const reserve = () => root.style.setProperty("--banner-space", `${Math.ceil(el.offsetHeight) + GAP}px`);
    reserve();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(reserve) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.setProperty("--banner-space", "0px");
    };
  }, [visible, text]);

  if (!visible) return null;
  return (
    <div ref={ref} className={`connection-banner${offline ? " offline" : ""}`} role="status" aria-live="polite">
      {offline ? <SignalOff size={16} /> : <Signal size={16} />}
      {text}
    </div>
  );
}

export default ConnectionBanner;
