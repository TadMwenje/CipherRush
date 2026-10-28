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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Match3Game() {
  const { gameProgress, applyResult, toasts } = useGameRewards("match3", "Match-3");
  const { round, loading, error, setError, startNew } = useRound("match3");
  const { board, setBoard, reset, rejectSwap, playSteps, poppingCells, droppingColumns, invalidCells, cascade } =
    useMatch3Animator();
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(0);
  const [reshuffled, setReshuffled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // New or resumed round -> hydrate the board.
  useEffect(() => {
    if (!round) return;
    if (!Array.isArray(round.board) || round.board.length === 0) {
      // Never sit on a loading state: say so and offer a way out.
      reset(null);
      setError("The board didn't come through.");
      return;
    }
    setError("");
    reset(round.board);
    setScore(round.score ?? 0);
    setMovesLeft(round.moves_left ?? round.moves_allowed);
    setResult(null);
  }, [round, reset, setError]);

  const attemptSwap = async (a, b) => {
    if (busy || result || !board) return;
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
        if (data.finished) {
          setResult(data.result);
          if (data.result.won) {
            playVictory();
            haptic("win");
          } else {
            playDefeat();
            haptic("error");
          }
          applyResult(data.result);
        }
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
      <GameHeader title="Match-3" modeKey="match3">
        {round && <div className="level-badge">Lv {round.level}</div>}
      </GameHeader>

      <GameLevelBar progress={gameProgress} />

      {round && (
        <>
          <div className="game-stats">
            <div className="stat">
              <span className="stat-label">Score</span> {score}
            </div>
            <div className={`stat${movesLeft <= 3 && !result ? " stat-warning" : ""}`}>
              <span className="stat-label">Moves</span> {movesLeft}
            </div>
            <div className="stat">
              <span className="stat-label">Target</span> {target}
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
              Deal a new board
            </button>
          )}
        </div>
      )}
      {cascade && (
        <div className="cascade-banner">
          <Flame size={18} /> Chain x{cascade}
        </div>
      )}
      {reshuffled && (
        <div className="cascade-banner reshuffle-banner">
          <Shuffle size={18} /> Dead board. Reshuffling.
        </div>
      )}

      <div className="game-stage match3-stage">
        {(loading || !board) && !error && <div className="loading-inline">Loading board</div>}
        {board && (
          <Match3Board
            board={board}
            locked={busy || !!result}
            finished={!!result}
            syncing={syncing}
            poppingCells={poppingCells}
            droppingColumns={droppingColumns}
            invalidCells={invalidCells}
            onSwap={attemptSwap}
          />
        )}

        {result && (
          <div className={`match3-result ${result.won ? "won" : "lost"}`}>
            <h2 className="match3-result-heading">
              {result.won ? <Confetti size={24} /> : <Hourglass size={24} />}
              {result.won ? "Board cleared." : "Out of moves."}
            </h2>
            <div className="final-score">+{result.final_score}</div>
            <p className="match3-result-copy">
              {result.won
                ? result.efficiency_bonus > 0
                  ? `${result.moves_left} moves to spare, +${result.efficiency_bonus}.`
                  : "Right down to the wire."
                : `${Math.max(target - score, 0)} short. Doesn't count toward your level.`}
            </p>
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={() => startNew()}>
                {result.game_progress?.leveled_up ? `Play level ${result.game_progress.level}` : result.won ? "Again" : "Retry"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Match3Game;
