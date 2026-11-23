import React from "react";
import { Users } from "../glyphs";
import { GAME_MODES } from "../constants/gameModes";
import { formatNumber, modeText, useLanguage, useT } from "../i18n";

// Compact per-game level/XP readout shown in each game's header. Distinct
// from the account-wide level shown on the dashboard - every game levels up
// independently from its own XP.
function GameLevelBar({ progress }) {
  const t = useT();
  const lang = useLanguage();
  if (!progress) return null;

  const {
    game_type: gameType,
    level,
    xp,
    xp_for_next_level: xpForNext,
    completions_at_level: completions,
    completions_needed: needed,
    cross_game_gate_active: crossGateActive,
    other_games_played: otherGames,
    other_games_required: otherNeeded,
  } = progress;

  const percent = xpForNext > 0 ? Math.min(100, Math.round((xp / xpForNext) * 100)) : 100;
  // XP keeps banking past the threshold while a gate holds the level-up back,
  // but the fraction shown here should never display more than its own total.
  const displayedXp = xpForNext > 0 ? Math.min(xp, xpForNext) : xp;

  const xpReady = xpForNext > 0 && xp >= xpForNext;
  const completionsReady = completions >= needed;
  const crossGameReady = !crossGateActive || (otherGames ?? 0) >= otherNeeded;

  let statusMessage = null;
  if (xpForNext > 0) {
    if (!xpReady) {
      statusMessage = t("lvl.rounds", { done: completions, need: needed });
    } else if (!completionsReady) {
      statusMessage = t("lvl.roundsLeft", { n: needed - completions });
    } else if (!crossGameReady) {
      const otherLabels = GAME_MODES.filter((m) => m.key !== gameType)
        .slice(0, 3)
        .map((m) => modeText(m, lang).label)
        .join(", ");
      statusMessage = t("lvl.locked", { next: level + 1, modes: otherLabels });
    }
  }

  return (
    <div className="game-level-bar">
      <div className="game-level-bar-row">
        <span>{t("dash.level", { n: level })}</span>
        <span>
          {xpForNext > 0
            ? t("lvl.xp", { have: formatNumber(displayedXp, lang), need: formatNumber(xpForNext, lang) })
            : t("lvl.max")}
        </span>
      </div>
      <div className="progress-bar game-level-progress">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {statusMessage && (
        <div className={`game-level-completions${xpReady ? " ready" : ""}`}>{statusMessage}</div>
      )}
      {crossGateActive && (
        <div className={`game-level-crossgame${crossGameReady ? " ready" : ""}`}>
          <Users size={12} aria-hidden="true" />
          {t("lvl.otherModes", { have: otherGames ?? 0, need: otherNeeded })}
        </div>
      )}
    </div>
  );
}

export default GameLevelBar;
