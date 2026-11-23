import React from "react";
import { LANGUAGES, setLanguage, useLanguage, useT } from "../i18n";
import { haptic } from "../mobile/haptics";

// Interface language, saved on this device (i18n/index.js). Works offline.
function LanguageSettings() {
  const t = useT();
  const lang = useLanguage();
  return (
    <section className="profile-section language-settings">
      <h2 id="language-title">{t("settings.language")}</h2>
      <div className="language-grid" role="radiogroup" aria-labelledby="language-title">
        {LANGUAGES.map(({ code, name }) => (
          <button
            key={code}
            type="button"
            role="radio"
            lang={code}
            aria-checked={lang === code}
            className={`language-btn${lang === code ? " active" : ""}`}
            onClick={() => {
              haptic("select");
              setLanguage(code);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="language-hint">{t("settings.languageHint")}</p>
    </section>
  );
}

export default LanguageSettings;
