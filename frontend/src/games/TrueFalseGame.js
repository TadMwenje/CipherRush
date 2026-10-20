import React, { useState, useEffect, useRef } from "react";
import { Flame, Check, Close, Sparkle, Confetti } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playWrong, playVictory } from "../sound";
import { haptic } from "../mobile/haptics";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";

const FEEDBACK_MS = 1500;
const SWIPE_COMMIT_PX = 90;

function TrueFalseGame() {
  const { gameProgress, applyResult, toasts } = useGameRewards("truefalse", "True or False");
  const { round, error, setError, startNew } = useRound("truefalse");
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [streak, setStreak] = useState(0);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState(null);
  const [dragX, setDragX] = useState(0);
  const drag = useRef(null);

  useEffect(() => {
    if (!round) return;
    setIndex(round.answered ?? 0);
    setStreak(round.streak ?? 0);
    setFeedback(null);
    setResult(null);
  }, [round]);

  const answer = async (choice) => {
    if (locked || !round) return;
    setLocked(true);
    setDragX(0);
    try {
      // The server grades each answer as it lands; the client never holds the key.
      const { data } = await api.post(`/games/truefalse/rounds/${round.round_id}/answer`, { index, answer: choice });
      setFeedback({ correct: data.correct, explanation: data.explanation, points: data.points });
      setStreak(data.streak);
      if (data.correct) {
        playCorrect();
        haptic("success");
      } else {
        playWrong();
        haptic("error");
      }
      setTimeout(() => {
        setFeedback(null);
        setLocked(false);
        if (data.finished) {
          setResult(data.result);
          if (data.result.perfect) playVictory();
          applyResult(data.result);
        } else {
          setIndex((i) => i + 1);
        }
      }, FEEDBACK_MS);
    } catch (err) {
      setError(errorMessage(err));
      setLocked(false);
    }
  };

  // Swipe the card: right = true, left = false.
  const onPointerDown = (e) => {
    if (locked || feedback) return;
    drag.current = { x: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setDragX(e.clientX - drag.current.x);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (Math.abs(dragX) >= SWIPE_COMMIT_PX) answer(dragX > 0);
    else setDragX(0);
  };

  const statements = round?.statements || [];
  const statement = statements[index];
  const lean = dragX > 30 ? "lean-true" : dragX < -30 ? "lean-false" : "";

  return (
    <div className="game-screen binary-game">
      {toasts}
      <GameHeader title="True or False" modeKey="truefalse" />
      <GameLevelBar progress={gameProgress} />
      {error && <p className="error">{error}</p>}

      {statement && !result && (
        <>
          <div className="game-stats">
            <div className="stat">
              <span className="stat-label">Claim</span> {index + 1}/{statements.length}
            </div>
            <div className={`stat${streak >= 3 ? " stat-hot" : ""}`}>
              <Flame size={16} /> {streak}
            </div>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${((index + (feedback ? 1 : 0)) / statements.length) * 100}%` }} />
          </div>
        </>
      )}

      <div className="game-stage">
        {!round && !error && <div className="loading-inline">Loading statements</div>}
        {statement && !result && (
          <>
            <div
              className={`binary-statement swipe-card ${lean}`}
              style={{ transform: `translateX(${dragX}px) rotate(${dragX / 25}deg)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                drag.current = null;
                setDragX(0);
              }}
            >
              {statement.statement}
              <span className="swipe-hint" aria-hidden="true">
                ← false · true →
              </span>
            </div>

            {!feedback ? (
              <div className="binary-choices">
                <button className="binary-choice false" onClick={() => answer(false)} disabled={locked}>
                  <span className="binary-choice-icon">
                    <Close size={28} color="#f87171" />
                  </span>
                  False
                </button>
                <button className="binary-choice true" onClick={() => answer(true)} disabled={locked}>
                  <span className="binary-choice-icon">
                    <Check size={28} color="#4ade80" />
                  </span>
                  True
                </button>
              </div>
            ) : (
              <div className={`binary-feedback ${feedback.correct ? "correct" : "wrong"}`} role="status">
                <div className="binary-feedback-badge">
                  {feedback.correct ? <Check size={20} color="#4ade80" /> : <Close size={20} color="#f87171" />}
                  {feedback.correct ? `Right. +${feedback.points}` : "Wrong."}
                </div>
                <p>{feedback.explanation}</p>
              </div>
            )}
          </>
        )}

        {result && (
          <div className="match3-result won">
            <h2 className="match3-result-heading">
              {result.perfect ? <Sparkle size={24} /> : <Confetti size={24} />}
              {result.perfect ? "Ten for ten." : `${result.correct_count} out of ${result.total_questions}.`}
            </h2>
            <div className="final-score">+{result.score}</div>
            <p className="match3-result-copy">
              Best streak {result.best_streak}
              {!result.passed && " · 7 needed to count toward your level"}
            </p>
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={() => startNew()}>
                Ten more
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TrueFalseGame;
