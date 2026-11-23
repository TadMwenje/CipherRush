import React, { useEffect, useRef } from "react";
import { Close, Trophy } from "../glyphs";
import { GAME_MODES, DAILY_MODE } from "../constants/gameModes";
import { WALKTHROUGHS } from "../constants/walkthroughs";
import Walkthrough from "./Walkthrough";
import { modeText, useLanguage, useT } from "../i18n";

// Rules for every mode. Opened from the welcome screen, the dashboard, and
// each game's "?" button (scrolled to that game via focusKey). From a game,
// modes with a walkthrough show it first, then the quick rules.
function HowToPlayModal({ onClose, focusKey }) {
  const sectionRefs = useRef({});
  const t = useT();
  const lang = useLanguage();
  // A walkthrough opens at its first step, so don't scroll past it to the rules.
  const steps = focusKey && WALKTHROUGHS[focusKey];

  useEffect(() => {
    if (focusKey && !steps && sectionRefs.current[focusKey]) {
      sectionRefs.current[focusKey].scrollIntoView({ block: "start" });
    }
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusKey, steps, onClose]);

  const all = [DAILY_MODE, ...GAME_MODES];
  const modes = focusKey ? all.filter((m) => m.key === focusKey) : all;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="auth-modal howto-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="howto-close" onClick={onClose} aria-label={t("howto.close")}>
          <Close size={20} />
        </button>
        <h2 id="howto-title" className="howto-title">
          {focusKey ? modes[0] && modeText(modes[0], lang).label : t("howto.title")}
        </h2>
        {!focusKey && <p className="howto-intro">{t("howto.intro")}</p>}
        {steps && <Walkthrough steps={steps} />}
        <div className="howto-sections">
          {modes.map((mode) => {
            const { key, Icon, css } = mode;
            const { label, rules } = modeText(mode, lang);
            return (
              <section key={key} className={`howto-section ${css}`} ref={(el) => (sectionRefs.current[key] = el)}>
                <h3>
                  {steps ? (
                    t("howto.quickRules")
                  ) : (
                    <>
                      <span className="game-icon">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      {label}
                    </>
                  )}
                </h3>
                <ul>
                  {rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        {!focusKey && (
          <p className="howto-footer">
            <Trophy size={14} /> {t("howto.footer")}
          </p>
        )}
      </div>
    </div>
  );
}

export default HowToPlayModal;
