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
import { useT } from "../i18n";


/** One-time card on the dashboard. Nothing is asked of the OS until "Turn on" is tapped. */
export function ReminderPrompt() {
  const t = useT();
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
      setMessage(t("rem.blocked"));
    }
  };

  const notNow = () => {
    haptic("tap");
    declineNotifications();
    setVisible(false);
  };

  return (
    <div className="reminder-prompt" role="region" aria-label={t("rem.label")}>
      <div className="reminder-prompt-icon">
        <Calendar size={22} />
      </div>
      <div className="reminder-prompt-body">
        <div className="reminder-prompt-title">{t("rem.title")}</div>
        <div className="reminder-prompt-copy">
          {message || t("rem.copy")}
        </div>
        {!message && (
          <div className="reminder-prompt-actions">
            <button className="btn-primary" onClick={turnOn} disabled={busy}>
              {t("rem.turnOn")}
            </button>
            <button className="btn-secondary" onClick={notNow} disabled={busy}>
              {t("rem.notNow")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Profile → Account row. Reflects the OS permission live, including a revoke in Settings. */
export function ReminderSettings() {
  const t = useT();
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
      <span className="account-label">{t("rem.label")}</span>
      <label className="switch-row">
        <span>{t("rem.switch")}</span>
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
      {blocked && <span className="account-note">{t("rem.blocked")}</span>}
    </div>
  );
}
