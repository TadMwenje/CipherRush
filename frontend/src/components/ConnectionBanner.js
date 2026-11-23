import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SignalOff, Signal } from "../glyphs";
import { useNetworkStatus } from "../mobile/hooks";
import { useT } from "../i18n";

// Height of the strip the banner reserves at the top of every screen.
const BANNER_SPACE = "44px";

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

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--banner-space", visible ? BANNER_SPACE : "0px");
    return () => root.style.setProperty("--banner-space", "0px");
  }, [visible]);

  if (!visible) return null;
  const offline = status === "offline";
  let text = t("net.reconnecting");
  if (offline) text = inRound(pathname) ? t("net.offlineRound") : t("net.offline");
  return (
    <div className={`connection-banner${offline ? " offline" : ""}`} role="status" aria-live="polite">
      {offline ? <SignalOff size={16} /> : <Signal size={16} />}
      {text}
    </div>
  );
}

export default ConnectionBanner;
