import React, { useState } from "react";
import { useT } from "../i18n";
import { haptic, hapticsEnabled, setHapticsEnabled } from "../mobile/haptics";
import { AudioSettingsFields } from "./AudioControl";
import LanguageSettings from "./LanguageSettings";
import { ReminderSettings } from "./Reminders";

function Toggle({ label, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-checked={checked}
      />
    </label>
  );
}

/**
 * Profile → Preferences: language, music / sound effects / volume (the same
 * settings as the in-game speaker button), vibration, reminders. All of it
 * lives on this device, so the card works offline and before the profile loads.
 */
function Preferences({ signedIn = true }) {
  const t = useT();
  const [buzz, setBuzz] = useState(hapticsEnabled);

  return (
    <section className="profile-section profile-group" aria-labelledby="prefs-title">
      <h2 id="prefs-title">{t("pref.title")}</h2>
      <LanguageSettings />
      <div className="account-row">
        <AudioSettingsFields />
        <Toggle
          label={t("pref.haptics")}
          checked={buzz}
          onChange={(on) => {
            setHapticsEnabled(on);
            setBuzz(on);
            if (on) haptic("select");
          }}
        />
      </div>
      {signedIn && <ReminderSettings />}
    </section>
  );
}

export default Preferences;
