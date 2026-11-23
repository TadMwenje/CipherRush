import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import "./mobile/touchAudit";
import { installKeyboardManager } from "./mobile/keyboard";
import { installNetworkMonitor, isOnline, onNetworkChange, refreshNetworkState } from "./mobile/network";
import { installLifecycle, onAppPause, onAppResume } from "./mobile/lifecycle";
import { syncServerClock } from "./mobile/clock";
import { installAudioUnlock, pauseAudio, resumeAudio } from "./utils/soundEngine";
import { installNotifications } from "./notifications";

installKeyboardManager();
installNetworkMonitor();
installLifecycle();
installNotifications();

// Back from the background or back online: one small request re-syncs the
// server clock and confirms the connection (which clears the banner). Never
// while offline, so a phone with data switched off isn't asked for anything.
onAppResume(() => refreshNetworkState().then(() => isOnline() && syncServerClock()));
onNetworkChange((s) => s.online && syncServerClock());
// Music and effects stop in the background and pick up again on return.
installAudioUnlock();
onAppPause(() => pauseAudio("background"));
onAppResume(() => resumeAudio("background"));

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
