import React, { useState, useEffect, useRef } from "react";
import { Circuit, Sparkle, Confetti } from "../glyphs";
import api, { errorMessage } from "../api";
import { playFlip, playPop, playInvalid, playVictory } from "../sound";
import { haptic } from "../mobile/haptics";
import { bestGrid } from "../mobile/layout";
import { useElementSize } from "../mobile/hooks";
import GameSymbolIcon from "../icons/GameSymbolIcon";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import { afterBreak } from "../ads/pacing";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";

const MISMATCH_SHOW_MS = 850;
const GRID_GAP = 8;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function MemoryGame() {
  const { gameProgress, applyResult, toasts } = useGameRewards("memory", "Memory Lock");
  const { round, error, setError, startNew } = useRound("memory");
  const [faces, setFaces] = useState({});
  const [faceUp, setFaceUp] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [wrongPair, setWrongPair] = useState([]);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const stageRef = useRef(null);
  const stage = useElementSize(stageRef);

  // New or resumed round.
  useEffect(() => {
    if (!round) return;
    const revealed = Object.fromEntries(Object.entries(round.revealed || {}).map(([k, v]) => [Number(k), v]));
    setFaces(revealed);
    setMatched(new Set(round.matched || []));
    setFaceUp(round.pending != null ? [round.pending] : []);
    setWrongPair([]);
    setMoves(round.moves || 0);
    setResult(null);
  }, [round]);

  const flip = async (index) => {
    if (busy || result || faceUp.includes(index) || matched.has(index)) return;
    setBusy(true);
    playFlip();
    haptic("tap");
    try {
      const { data } = await api.post(`/games/memory/rounds/${round.round_id}/flip`, { index });
      setFaces((f) => ({ ...f, [index]: data.symbol }));
      if (!data.pair_complete) {
        setFaceUp([index]);
        return;
      }
      setFaceUp([data.first_index, index]);
      setMoves(data.moves);
      if (data.match) {
        await pause(300);
        setMatched((m) => new Set([...m, data.first_index, index]));
        setFaceUp([]);
        playPop();
        haptic("match");
      } else {
        await pause(350);
        setWrongPair([data.first_index, index]);
        playInvalid();
        haptic("error");
        await pause(MISMATCH_SHOW_MS);
        setWrongPair([]);
        setFaceUp([]);
      }
      if (data.finished) {
        setResult(data.result);
        playVictory();
        haptic("win");
        applyResult(data.result);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // The stage fills whatever height is left; if that's tiny (keyboard up, very
  // short window) fall back to fitting by width and let the page scroll.
  const usableHeight = stage.height > 160 ? stage.height : stage.width * 1.6;
  const grid = round ? bestGrid(round.card_count, stage.width, usableHeight, GRID_GAP) : null;
  const resetting = busy && wrongPair.length > 0;

  return (
    <div className="game-screen memory-game">
      {toasts}
      <GameHeader title="Memory Lock" modeKey="memory" />
      <GameLevelBar progress={gameProgress} />
      {error && <p className="error">{error}</p>}

      {round && (
        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">Pairs</span> {matched.size / 2}/{round.pairs}
          </div>
          <div className={`stat${resetting ? " stat-warning" : ""}`} aria-live="polite">
            {resetting ? "No match" : (
              <>
                <span className="stat-label">Moves</span> {moves}
              </>
            )}
          </div>
        </div>
      )}

      <div className="game-stage memory-stage" ref={stageRef}>
        {!round && !error && <div className="loading-inline">Loading cards</div>}
        {round && grid && grid.size > 0 && (
          <div
            className={`memory-grid${resetting ? " is-busy" : ""}`}
            style={{
              gridTemplateColumns: `repeat(${grid.columns}, ${grid.size}px)`,
              gridAutoRows: `${grid.size}px`,
              gap: `${GRID_GAP}px`,
            }}
          >
            {Array.from({ length: round.card_count }, (_, index) => {
              const isMatched = matched.has(index);
              const isFaceUp = isMatched || faceUp.includes(index);
              const symbol = faces[index];
              return (
                <button
                  key={index}
                  className={`memory-card${isFaceUp ? " flipped" : ""}${isMatched ? " matched" : ""}${wrongPair.includes(index) ? " wrong" : ""}`}
                  onClick={() => flip(index)}
                  disabled={isFaceUp || !!result}
                  aria-label={isFaceUp && symbol ? `Card: ${symbol}` : `Card ${index + 1}, face down`}
                >
                  <div className="memory-card-inner">
                    <div className="memory-card-face memory-card-back">
                      <Circuit size={Math.max(18, grid.size * 0.32)} />
                    </div>
                    <div className="memory-card-face memory-card-front">
                      {symbol && <GameSymbolIcon symbolKey={symbol} size={Math.max(22, grid.size * 0.42)} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {result && (
          <div className="match3-result won">
            <h2 className="match3-result-heading">
              {result.perfect ? <Sparkle size={24} /> : <Confetti size={24} />}
              {result.perfect ? "Perfect recall." : "Board cleared."}
            </h2>
            <div className="final-score">+{result.score}</div>
            <p className="match3-result-copy">
              {result.moves} moves · {result.misses} miss{result.misses === 1 ? "" : "es"}
              {!result.passed && " · too many misses to count toward your level"}
            </p>
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={afterBreak(() => startNew())}>
                {result.game_progress?.leveled_up ? `Play level ${result.game_progress.level}` : "Deal again"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MemoryGame;
