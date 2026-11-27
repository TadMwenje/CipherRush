import React, { useState, useEffect } from "react";
import { Flame, Confetti, Hourglass, Shuffle } from "../glyphs";
import api, { errorMessage } from "../api";
import { playVictory, playDefeat } from "../sound";
import { haptic } from "../mobile/haptics";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";
import Match3Board, { useMatch3Animator } from "./Match3Board";
import { findMatches, swapped } from "../practice/match3";
import { adsAvailable } from "../ads/admob";
import { earnReward } from "../ads/rewards";
import { afterBreak } from "../ads/pacing";
import { useT } from "../i18n";
import useModeLabel from "../hooks/useModeLabel";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Match3Game() {
  const { gameProgress, applyResult, toasts } = useGameRewards("match3");
  const t = useT();
  const title = useModeLabel("match3");
  const { round, loading, error, setError, startNew } = useRound("match3");
  const { board, setBoard, reset, rejectSwap, playSteps, poppingCells, droppingColumns, invalidCells, cascade } =
    useMatch3Animator();
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(0);
  const [reshuffled, setReshuffled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  // Ran out short of the target: offer +N moves for a rewarded video, or end it.
  const [outOfMoves, setOutOfMoves] = useState(null);
  const [watching, setWatching] = useState(false);

  // New or resumed round -> hydrate the board.
  useEffect(() => {
    if (!round) return;
    if (!Array.isArray(round.board) || round.board.length === 0) {
      // Never sit on a loading state: say so and offer a way out.
      reset(null);
      setError(t("m3.noBoard"));
      return;
    }
    setError("");
    reset(round.board);
    setScore(round.score ?? 0);
    setMovesLeft(round.moves_left ?? round.moves_allowed);
    setResult(null);
    setOutOfMoves(round.out_of_moves ? { moves: 5, message: "" } : null);
  }, [round, reset, setError]);

  const finishWith = (finished) => {
    setOutOfMoves(null);
    setResult(finished);
    if (finished.won) {
      playVictory();
      haptic("win");
    } else {
      playDefeat();
      haptic("error");
    }
    applyResult(finished);
  };

  const watchForMoves = async () => {
    setWatching(true);
    try {
      const rewardId = await earnReward("continue", round.round_id);
      const { data } = await api.post(`/games/match3/rounds/${round.round_id}/continue`, { reward_id: rewardId });
      setMovesLeft(data.moves_left);
      setOutOfMoves(null);
      haptic("success");
    } catch (err) {
      setOutOfMoves((o) => ({ ...o, message: errorMessage(err) }));
    } finally {
      setWatching(false);
    }
  };

  const endRound = async () => {
    setWatching(true);
    try {
      const { data } = await api.post(`/games/match3/rounds/${round.round_id}/finish`);
      finishWith(data.result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWatching(false);
    }
  };

  const attemptSwap = async (a, b) => {
    if (busy || result || outOfMoves || !board) return;
    const attempt = swapped(board, a, b);
    setBusy(true);

    // Same rule the server applies - used only for instant feedback.
    if (!findMatches(attempt).size) {
      await rejectSwap(board, attempt, a, b);
      setBusy(false);
      return;
    }

    setBoard(attempt);
    // If the server is slow (bad signal), say so instead of looking frozen.
    const syncTimer = setTimeout(() => setSyncing(true), 700);
    try {
      const res = await api.post(`/games/match3/rounds/${round.round_id}/swap`, {
        a: [a.row, a.col],
        b: [b.row, b.col],
        can_continue: adsAvailable(),
      });
      const data = res.data;
      if (!data.valid) {
        setBoard(data.board);
      } else {
        await playSteps(data.steps);
        setScore(data.score);
        setMovesLeft(data.moves_left);
        if (data.reshuffled) {
          setReshuffled(true);
          await sleep(500);
          setBoard(data.board);
          setTimeout(() => setReshuffled(false), 1400);
        }
        if (data.out_of_moves) {
          haptic("error");
          setOutOfMoves({ moves: data.continue_moves, message: "" });
        }
        if (data.finished) finishWith(data.result);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBoard(board);
    } finally {
      clearTimeout(syncTimer);
      setSyncing(false);
      setBusy(false);
    }
  };

  const target = round?.target_score ?? 0;
  const progressPct = Math.min(100, Math.round((score / Math.max(target, 1)) * 100));

  return (
    <div className="game-screen match3-game">
      {toasts}
      <GameHeader title={title} modeKey="match3">
        {round && <div className="level-badge">{t("m3.lv", { n: round.level })}</div>}
      </GameHeader>

      <GameLevelBar progress={gameProgress} />

      {round && (
        <>
          <div className="game-stats">
            <div className="stat">
              <span className="stat-label">{t("g.score")}</span> {score}
            </div>
            <div className={`stat${movesLeft <= 3 && !result ? " stat-warning" : ""}`}>
              <span className="stat-label">{t("g.moves")}</span> {movesLeft}
            </div>
            <div className="stat">
              <span className="stat-label">{t("g.target")}</span> {target}
            </div>
          </div>
          <div className="progress-bar match3-target-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </>
      )}

      {error && (
        <div className="error-row">
          <p className="error">{error}</p>
          {!board && (
            <button className="retry-btn" onClick={() => startNew()}>
              {t("m3.newBoard")}
            </button>
          )}
        </div>
      )}
      {cascade && (
        <div className="cascade-banner">
          <Flame size={18} /> {t("g.chain", { n: cascade })}
        </div>
      )}
      {reshuffled && (
        <div className="cascade-banner reshuffle-banner">
          <Shuffle size={18} /> {t("g.reshuffle")}
        </div>
      )}

      <div className="game-stage match3-stage">
        {(loading || !board) && !error && <div className="loading-inline">{t("m3.loading")}</div>}
        {board && (
          <Match3Board
            board={board}
            locked={busy || !!result || !!outOfMoves}
            finished={!!result}
            syncing={syncing}
            poppingCells={poppingCells}
            droppingColumns={droppingColumns}
            invalidCells={invalidCells}
            onSwap={attemptSwap}
          />
        )}

        {outOfMoves && !result && (
          <div className="match3-result lost" role="dialog" aria-label={t("m3.outLabel")}>
            <h2 className="match3-result-heading">
              <Hourglass size={24} /> {t("g.outOfMoves")}
            </h2>
            <p className="match3-result-copy">
              {t("m3.offer", { n: Math.max(target - score, 0), m: outOfMoves.moves })}
            </p>
            {outOfMoves.message && <p className="error">{outOfMoves.message}</p>}
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={watchForMoves} disabled={watching}>
                {watching ? t("g.loadingVideo") : t("m3.watch", { m: outOfMoves.moves })}
              </button>
              <button className="hint-btn" onClick={endRound} disabled={watching}>
                {t("m3.end")}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`match3-result ${result.won ? "won" : "lost"}`}>
            <h2 className="match3-result-heading">
              {result.won ? <Confetti size={24} /> : <Hourglass size={24} />}
              {result.won ? t("g.boardCleared") : t("g.outOfMoves")}
            </h2>
            <div className="final-score">+{result.final_score}</div>
            <p className="match3-result-copy">
              {result.won
                ? result.efficiency_bonus > 0
                  ? t("m3.spare", { n: result.moves_left, b: result.efficiency_bonus })
                  : t("m3.wire")
                : t("m3.short", { n: Math.max(target - score, 0) })}
            </p>
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={afterBreak(() => startNew())}>
                {result.game_progress?.leveled_up
                  ? t("g.playLevel", { n: result.game_progress.level })
                  : result.won
                    ? t("m3.again")
                    : t("m3.retry")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Match3Game;
