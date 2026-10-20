import React, { useState, useEffect, useRef } from "react";
import { Flame, Confetti, Hourglass, Shuffle } from "../glyphs";
import api, { errorMessage } from "../api";
import { playMatch, playInvalid, playVictory, playDefeat } from "../sound";
import { haptic } from "../mobile/haptics";
import { swipeDirection } from "../mobile/layout";
import GameSymbolIcon from "../icons/GameSymbolIcon";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HINT_DELAY_MS = 7000;

function swapped(board, a, b) {
  const next = board.map((row) => [...row]);
  [next[a.row][a.col], next[b.row][b.col]] = [next[b.row][b.col], next[a.row][a.col]];
  return next;
}

// Same rule the server applies - used only for instant feedback and hints.
export function hasMatch(board) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const s = board[r][c];
      if (c + 2 < size && board[r][c + 1] === s && board[r][c + 2] === s) return true;
      if (r + 2 < size && board[r + 1][c] === s && board[r + 2][c] === s) return true;
    }
  }
  return false;
}

export function findHint(board) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const b = { row: r + dr, col: c + dc };
        if (b.row < size && b.col < size && hasMatch(swapped(board, { row: r, col: c }, b))) {
          return [{ row: r, col: c }, b];
        }
      }
    }
  }
  return null;
}

const isAdjacent = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

function Match3Game() {
  const { gameProgress, applyResult, toasts } = useGameRewards("match3", "Match-3");
  const { round, loading, error, setError, startNew } = useRound("match3");
  const [board, setBoard] = useState(null);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(0);
  const [selected, setSelected] = useState(null);
  const [invalidCells, setInvalidCells] = useState(null);
  const [poppingCells, setPoppingCells] = useState(new Set());
  const [droppingColumns, setDroppingColumns] = useState([]);
  const [cascade, setCascade] = useState(null);
  const [hint, setHint] = useState(null);
  const [reshuffled, setReshuffled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const hintTimer = useRef(null);
  const pointer = useRef(null);

  // New or resumed round -> hydrate the board.
  useEffect(() => {
    if (!round) return;
    if (!Array.isArray(round.board) || round.board.length === 0) {
      // Never sit on a loading state: say so and offer a way out.
      setBoard(null);
      setError("The board didn't come through.");
      return;
    }
    setError("");
    setBoard(round.board);
    setScore(round.score ?? 0);
    setMovesLeft(round.moves_left ?? round.moves_allowed);
    setDroppingColumns(Array(round.board_size).fill(0));
    setSelected(null);
    setResult(null);
  }, [round]);

  // Idle hint: glow one legal swap if the player goes quiet.
  useEffect(() => {
    clearTimeout(hintTimer.current);
    setHint(null);
    if (!board || busy || result) return undefined;
    hintTimer.current = setTimeout(() => setHint(findHint(board)), HINT_DELAY_MS);
    return () => clearTimeout(hintTimer.current);
  }, [board, busy, result, selected]);

  const animateSteps = async (steps) => {
    for (const step of steps) {
      setPoppingCells(new Set(step.matched.map(([r, c]) => `${r},${c}`)));
      playMatch(step.cascade);
      haptic("match");
      if (step.cascade > 1) setCascade(step.multiplier);
      await sleep(320);
      setPoppingCells(new Set());
      setBoard(step.board);
      setDroppingColumns(step.drops);
      await sleep(260);
      setDroppingColumns(Array(step.board.length).fill(0));
    }
    setCascade(null);
  };

  const attemptSwap = async (a, b) => {
    if (busy || result || !board) return;
    const attempt = swapped(board, a, b);
    setSelected(null);
    setBusy(true);

    if (!hasMatch(attempt)) {
      setInvalidCells([a, b]);
      setBoard(attempt);
      playInvalid();
      haptic("error");
      await sleep(260);
      setBoard(board);
      setInvalidCells(null);
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
        await animateSteps(data.steps);
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

  // Touch: swipe a tile into its neighbour. A press without a drag is a tap,
  // and two taps on neighbours also swap (for players who prefer that).
  const onPointerDown = (e, row, col) => {
    if (busy || result) return;
    pointer.current = { row, col, x: e.clientX, y: e.clientY, swiped: false };
  };

  const onPointerMove = (e) => {
    const p = pointer.current;
    if (!p || p.swiped) return;
    const dir = swipeDirection(e.clientX - p.x, e.clientY - p.y);
    if (!dir) return;
    p.swiped = true;
    const target = { row: p.row + dir.dr, col: p.col + dir.dc };
    const size = board.length;
    if (target.row < 0 || target.col < 0 || target.row >= size || target.col >= size) return;
    attemptSwap({ row: p.row, col: p.col }, target);
  };

  const onPointerUp = () => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.swiped || busy || result) return;
    const clicked = { row: p.row, col: p.col };
    haptic("tap");
    if (!selected) return setSelected(clicked);
    if (selected.row === p.row && selected.col === p.col) return setSelected(null);
    if (!isAdjacent(selected, clicked)) return setSelected(clicked);
    attemptSwap(selected, clicked);
  };

  const cellState = (r, c) => {
    const classes = ["board-cell"];
    if (selected && selected.row === r && selected.col === c) classes.push("selected");
    if (invalidCells?.some((cell) => cell.row === r && cell.col === c)) classes.push("invalid");
    if (poppingCells.has(`${r},${c}`)) classes.push("popping");
    if (droppingColumns[c] > r) classes.push("dropping");
    if (hint?.some((cell) => cell.row === r && cell.col === c)) classes.push("hint");
    return classes.join(" ");
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
          <div
            className={`match3-board${syncing ? " is-syncing" : ""}`}
            aria-disabled={!!result}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (pointer.current = null)}
            onPointerLeave={() => (pointer.current = null)}
          >
            {syncing && <div className="board-syncing" role="status">Syncing</div>}
            {board.map((rowArr, r) => (
              <div key={r} className="board-row">
                {rowArr.map((symbol, c) => (
                  <button
                    key={`${r}-${c}`}
                    className={cellState(r, c)}
                    onPointerDown={(e) => onPointerDown(e, r, c)}
                    disabled={!!result || busy}
                    aria-label={`${symbol}, row ${r + 1}, column ${c + 1}`}
                  >
                    <span className="board-cell-symbol">
                      <GameSymbolIcon symbolKey={symbol} size={24} />
                    </span>
                    {poppingCells.has(`${r},${c}`) && (
                      <span className="particle-burst" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
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
