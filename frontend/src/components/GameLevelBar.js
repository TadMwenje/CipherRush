import React from "react";
import { Users } from "../glyphs";
import { GAME_MODES } from "../constants/gameModes";

// Compact per-game level/XP readout shown in each game's header. Distinct
// from the account-wide level shown on the dashboard - every game levels up
// independently from its own XP.
function GameLevelBar({ progress }) {
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
      statusMessage = `${completions}/${needed} rounds cleared at this level`;
    } else if (!completionsReady) {
      const remaining = needed - completions;
      statusMessage = `XP is there. Clear ${remaining} more round${remaining === 1 ? "" : "s"} to level up.`;
    } else if (!crossGameReady) {
      const remaining = otherNeeded - (otherGames ?? 0);
      const otherLabels = GAME_MODES.filter((m) => m.key !== gameType)
        .slice(0, 3)
        .map((m) => m.label)
        .join(", ");
      statusMessage = `Level ${level + 1} is locked until you try ${remaining} more mode${remaining === 1 ? "" : "s"} - ${otherLabels}.`;
    }
  }

  return (
    <div className="game-level-bar">
      <div className="game-level-bar-row">
        <span>Level {level}</span>
        <span>{xpForNext > 0 ? `${displayedXp.toLocaleString()} / ${xpForNext.toLocaleString()} XP` : "Max level"}</span>
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
          {(otherGames ?? 0)}/{otherNeeded} other modes tried
        </div>
      )}
    </div>
  );
}

export default GameLevelBar;
