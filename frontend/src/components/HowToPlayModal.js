import React, { useEffect, useRef } from "react";
import { Close, Trophy } from "../glyphs";
import { GAME_MODES, DAILY_MODE } from "../constants/gameModes";

// Rules for every mode. Opened from the welcome screen, the dashboard, and
// each game's "?" button (scrolled to that game via focusKey).
function HowToPlayModal({ onClose, focusKey }) {
  const sectionRefs = useRef({});

  useEffect(() => {
    if (focusKey && sectionRefs.current[focusKey]) {
      sectionRefs.current[focusKey].scrollIntoView({ block: "start" });
    }
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusKey, onClose]);

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
        <button className="howto-close" onClick={onClose} aria-label="Close">
          <Close size={20} />
        </button>
        <h2 id="howto-title" className="howto-title">
          {focusKey ? modes[0]?.label : "How it works"}
        </h2>
        {!focusKey && (
          <p className="howto-intro">
            Each mode has its own level. To go up, earn the XP and clear 4 rounds at that level - losing
            rounds still pay a little, they just don't count. From level 5 you'll also need to have tried a
            couple of other modes. Every score is worked out on our server, so nobody's faking the board.
          </p>
        )}
        <div className="howto-sections">
          {modes.map(({ key, label, Icon, css, rules }) => (
            <section key={key} className={`howto-section ${css}`} ref={(el) => (sectionRefs.current[key] = el)}>
              <h3>
                <span className="game-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                {label}
              </h3>
              <ul>
                {rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {!focusKey && (
          <p className="howto-footer">
            <Trophy size={14} /> Ranks has three boards: all-time, best Rush run, and today's fastest Daily.
          </p>
        )}
      </div>
    </div>
  );
}

export default HowToPlayModal;
