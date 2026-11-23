import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Back, Help } from "../glyphs";
import HowToPlayModal from "./HowToPlayModal";
import { atRoundBreak } from "../ads/pacing";
import { useT } from "../i18n";
import AudioControl from "./AudioControl";
import useGameMusic from "../hooks/useGameMusic";

// Shared game screen header: back to dashboard, title, optional right-side
// slot (timer/level), the speaker button, and a "?" that opens this mode's
// rules. It also plays the mode's music while the screen is open.
function GameHeader({ title, modeKey, children }) {
  useGameMusic(modeKey);
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
          <AudioControl />
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
