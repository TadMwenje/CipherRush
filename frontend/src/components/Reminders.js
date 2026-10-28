import React, { useEffect, useState } from "react";
import { Calendar } from "../glyphs";
import {
  notificationsSupported,
  notificationPreference,
  permissionState,
  enableNotifications,
  disableNotifications,
  declineNotifications,
} from "../notifications";
import { onAppResume } from "../mobile/lifecycle";
import { haptic } from "../mobile/haptics";

const BLOCKED_COPY = "Notifications are off for CipherRush in your phone's Settings. Turn them on there first.";

/** One-time card on the dashboard. Nothing is asked of the OS until "Turn on" is tapped. */
export function ReminderPrompt() {
  const [visible, setVisible] = useState(() => notificationsSupported() && notificationPreference() === null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!visible) return null;

  const turnOn = async () => {
    haptic("tap");
    setBusy(true);
    const state = await enableNotifications();
    setBusy(false);
    if (state === "granted") {
      haptic("success");
      setVisible(false);
    } else {
      declineNotifications();
      setMessage(BLOCKED_COPY);
    }
  };

  const notNow = () => {
    haptic("tap");
    declineNotifications();
    setVisible(false);
  };

  return (
    <div className="reminder-prompt" role="region" aria-label="Reminders">
      <div className="reminder-prompt-icon">
        <Calendar size={22} />
      </div>
      <div className="reminder-prompt-body">
        <div className="reminder-prompt-title">Want a heads-up when the new Daily Cipher drops?</div>
        <div className="reminder-prompt-copy">
          {message || "New-cipher alerts and the odd nudge to come back. Never at night. Change it any time in Profile."}
        </div>
        {!message && (
          <div className="reminder-prompt-actions">
            <button className="btn-primary" onClick={turnOn} disabled={busy}>
              Turn on
            </button>
            <button className="btn-secondary" onClick={notNow} disabled={busy}>
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Profile → Account row. Reflects the OS permission live, including a revoke in Settings. */
export function ReminderSettings() {
  const [pref, setPref] = useState(notificationPreference);
  const [permission, setPermission] = useState("prompt");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => permissionState().then(setPermission);
    check();
    return onAppResume(check);
  }, []);

  if (!notificationsSupported()) return null;

  const blocked = permission === "denied";
  const on = pref === "on" && permission === "granted";

  const toggle = async () => {
    haptic("select");
    setBusy(true);
    if (on) {
      await disableNotifications();
      setPref("off");
    } else {
      const state = await enableNotifications();
      setPermission(state === "unsupported" ? "prompt" : state);
      if (state === "granted") setPref("on");
    }
    setBusy(false);
  };

  return (
    <div className="account-row">
      <span className="account-label">Reminders</span>
      <label className="switch-row">
        <span>Daily Cipher and come-back nudges</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={on}
          onChange={toggle}
          disabled={busy || blocked}
          aria-checked={on}
        />
      </label>
      {blocked && <span className="account-note">{BLOCKED_COPY}</span>}
    </div>
  );
}
