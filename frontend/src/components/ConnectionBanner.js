import React from "react";
import { SignalOff, Signal } from "../glyphs";
import { useNetworkStatus } from "../mobile/hooks";

// Pinned under the status bar while the phone has no connection, or while
// we're retrying a request that dropped mid-flight (e.g. Wi-Fi to cellular).
function ConnectionBanner() {
  const status = useNetworkStatus();
  if (status === "online") return null;
  const offline = status === "offline";
  return (
    <div className={`connection-banner${offline ? " offline" : ""}`} role="status" aria-live="polite">
      {offline ? <SignalOff size={16} /> : <Signal size={16} />}
      {offline ? "No signal. Your round is saved - we'll pick up when you're back." : "Reconnecting"}
    </div>
  );
}

export default ConnectionBanner;
