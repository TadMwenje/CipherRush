import React, { useState, useEffect, useCallback } from "react";
import api from "../api";
import AchievementToast from "../components/AchievementToast";
import LevelUpToast from "../components/LevelUpToast";
import { noteRoundFinished } from "../ads/pacing";

// Shared per-game plumbing: loads this game's level/XP track, and turns a
// completed round's server result into achievement + level-up toasts.
export default function useGameRewards(gameKey, label) {
  const [gameProgress, setGameProgress] = useState(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [newAchievements, setNewAchievements] = useState([]);
  const [levelUpItems, setLevelUpItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/me/game-progress")
      .then((res) => !cancelled && setGameProgress(res.data.games[gameKey]))
      .catch(() => {})
      .finally(() => !cancelled && setProgressLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [gameKey]);

  const applyResult = useCallback(
    (result) => {
      if (!result) return;
      noteRoundFinished();
      if (result.new_achievements?.length) setNewAchievements(result.new_achievements);
      const messages = [];
      if (result.boosted) messages.push("Double points: this round counted twice.");
      if (result.overall_level_up) messages.push(`Account level ${result.overall_level_up}.`);
      if (result.game_progress) {
        setGameProgress(result.game_progress);
        if (result.game_progress.leveled_up) {
          messages.push(`${label}: level ${result.game_progress.level} unlocked.`);
        }
      }
      if (messages.length) setLevelUpItems(messages);
    },
    [label]
  );

  const toasts = (
    <>
      <AchievementToast achievements={newAchievements} onDone={() => setNewAchievements([])} />
      <LevelUpToast items={levelUpItems} onDone={() => setLevelUpItems([])} />
    </>
  );

  return { gameProgress, progressLoaded, applyResult, toasts };
}
