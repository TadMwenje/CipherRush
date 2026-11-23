import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Back, Help } from "../glyphs";
import HowToPlayModal from "./HowToPlayModal";
import { atRoundBreak } from "../ads/pacing";
import { useT } from "../i18n";

// Shared game screen header: back to dashboard, title, optional right-side
// slot (timer/level), and a "?" that opens this mode's rules.
function GameHeader({ title, modeKey, children }) {
  const navigate = useNavigate();
  const t = useT();
  const [showRules, setShowRules] = useState(false);

  return (
    <>
      <div className="game-header">
        <button
          className="back-btn"
          onClick={() => atRoundBreak().then(() => navigate("/dashboard"))}
          aria-label={t("game.backToDashboard")}
        >
          <Back size={22} />
        </button>
        <h1>{title}</h1>
        <div className="game-header-side">
          {children}
          {modeKey && (
            <button
              className="rules-btn"
              onClick={() => setShowRules(true)}
              aria-label={t("dash.howToPlay", { mode: title })}
            >
              <Help size={20} />
            </button>
          )}
        </div>
      </div>
      {showRules && <HowToPlayModal focusKey={modeKey} onClose={() => setShowRules(false)} />}
    </>
  );
}

export default GameHeader;
