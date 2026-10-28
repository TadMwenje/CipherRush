import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bolt, Skip, Trophy, Flame } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playWrong, playVictory } from "../sound";
import { haptic } from "../mobile/haptics";
import { monoNow, serverNow } from "../mobile/clock";
import { onAppResume } from "../mobile/lifecycle";
import { primeKeyboard, claimFocus } from "../mobile/keyboard";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import useGameRewards from "../hooks/useGameRewards";
import { AnswerInput } from "./CipherGame";

const WARNING_SECONDS = 10;

function keyLabel(puzzle) {
  return puzzle.kind === "atbash" ? "Atbash · mirror it" : `ROT-${puzzle.shift} · shift back ${puzzle.shift}`;
}

function RushGame() {
  const navigate = useNavigate();
  const { gameProgress, applyResult, toasts } = useGameRewards("rush", "Speed Cipher Rush");
  const [round, setRound] = useState(null);
  const [view, setView] = useState(null);
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [flash, setFlash] = useState(null);
  const [lastPoints, setLastPoints] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const deadlineRef = useRef(null);
  const serverDeadlineRef = useRef(null);
  const finishingRef = useRef(false);
  const formRef = useRef(null);

  const focusInput = () => claimFocus(formRef.current?.querySelector("input"));

  const begin = useCallback((data) => {
    setRound(data);
    setView(data);
    setResult(null);
    setAnswer("");
    finishingRef.current = false;
    deadlineRef.current = monoNow() + (data.time_left ?? data.duration) * 1000;
    serverDeadlineRef.current = serverNow() + (data.time_left ?? data.duration) * 1000;
    setTimeLeft(data.time_left ?? data.duration);
    setTimeout(focusInput, 0);
  }, []);

  // Resume a run that was interrupted (app backgrounded, killed, call came in).
  useEffect(() => {
    api
      .get("/games/rush/rounds/active")
      .then((res) => res.data.round && begin(res.data.round))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [begin]);

  const start = async () => {
    primeKeyboard(); // must run inside the tap, before any await, or iOS won't show the keyboard
    setError("");
    try {
      const res = await api.post("/games/rush/rounds");
      haptic("select");
      begin(res.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const finishWith = useCallback(
    (data) => {
      setResult(data.result);
      playVictory();
      haptic("win");
      applyResult(data.result);
    },
    [applyResult]
  );

  const finish = useCallback(async () => {
    if (!round || finishingRef.current) return;
    finishingRef.current = true;
    try {
      const res = await api.post(`/games/rush/rounds/${round.round_id}/finish`);
      finishWith(res.data);
    } catch (err) {
      // Let a later tick try again, or the run sits at 0:00 forever.
      setTimeout(() => (finishingRef.current = false), 3000);
      setError(errorMessage(err));
    }
  }, [round, finishWith]);

  useEffect(() => {
    if (!round || result) return undefined;
    const tick = () => {
      const remaining = Math.ceil((deadlineRef.current - monoNow()) / 1000);
      setTimeLeft(Math.max(0, remaining));
      if (remaining <= 0) finish();
    };
    const id = setInterval(tick, 200);
    // Back from the background: the run kept going on the server, so re-anchor
    // on the server clock (see useCountdown) and settle it straight away.
    const offResume = onAppResume(() => {
      deadlineRef.current = monoNow() + (serverDeadlineRef.current - serverNow());
      tick();
    });
    return () => {
      clearInterval(id);
      offResume();
    };
  }, [round, result, finish]);

  const showFlash = (kind) => {
    setFlash(kind);
    setTimeout(() => setFlash(null), 420);
  };

  const handle = (data, kind) => {
    if (data.finished) {
      finishingRef.current = true;
      finishWith(data);
      return;
    }
    setView(data);
    showFlash(kind);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!answer.trim() || busy || result) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/games/rush/rounds/${round.round_id}/answer`, { answer });
      if (data.correct) {
        playCorrect();
        haptic("success");
        setLastPoints(data.points);
        setAnswer("");
      } else if (!data.finished) {
        playWrong();
        haptic("error");
      }
      handle(data, data.correct ? "correct" : "wrong");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      focusInput();
    }
  };

  const skip = async () => {
    if (busy || result || !round) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/games/rush/rounds/${round.round_id}/skip`);
      setAnswer("");
      haptic("tap");
      handle(data, "skip");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      focusInput();
    }
  };

  const playing = round && view && !result;

  return (
    <div className="game-screen rush-game">
      {toasts}
      <GameHeader title="Speed Rush" modeKey="rush">
        {playing && <div className={`timer${timeLeft <= WARNING_SECONDS ? " warning" : ""}`}>{timeLeft}s</div>}
      </GameHeader>
      <GameLevelBar progress={gameProgress} />
      {error && <p className="error">{error}</p>}

      {playing && (
        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">Score</span> {view.score}
          </div>
          <div className={`stat${view.combo >= 2 ? " stat-hot" : ""}`}>
            <Flame size={16} /> x{view.multiplier}
          </div>
          <div className="stat">
            <span className="stat-label">Cracked</span> {view.solved}
          </div>
        </div>
      )}

      <div className="game-stage">
        {!round && !result && !checking && (
          <div className="rush-intro">
            <div className="rush-intro-icon">
              <Bolt size={34} />
            </div>
            <h2>90 seconds. Go.</h2>
            <p>Every word shows its key. Crack them back to back and the combo climbs.</p>
            <button className="btn-primary" onClick={start}>
              Start
            </button>
          </div>
        )}

        {playing && (
          <div className={`rush-board${flash ? ` flash-${flash}` : ""}`}>
            <div className="rush-key">{keyLabel(view.puzzle)}</div>
            <div className="encrypted-text rush-cipher">{view.puzzle.ciphertext}</div>
            <div className="rush-points" aria-live="polite">
              {lastPoints && flash === "correct" ? `+${lastPoints}` : `next: ${view.next_points} pts`}
            </div>
            <form ref={formRef} className="answer-section" onSubmit={submit}>
              <AnswerInput value={answer} onChange={setAnswer} placeholder="Decoded word" />
              <div className="answer-actions">
                <button type="button" className="hint-btn" onClick={skip} disabled={busy}>
                  <Skip size={16} /> Skip
                </button>
                <button type="submit" className="submit-btn" disabled={busy || !answer.trim()}>
                  Crack
                </button>
              </div>
            </form>
          </div>
        )}

        {result && (
          <div className="match3-result won">
            <h2 className="match3-result-heading">
              <Bolt size={24} /> Time.
            </h2>
            <div className="final-score">+{result.score}</div>
            <p className="match3-result-copy">
              {result.solved} cracked · best combo {result.best_combo}
              {!result.passed && ` · ${result.pass_threshold} needed to count toward your level`}
            </p>
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={start}>
                Run it back
              </button>
              <button className="submit-btn" onClick={() => navigate("/leaderboard?board=rush")}>
                <Trophy size={16} /> Board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RushGame;
