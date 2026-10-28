import React, { useState, useEffect, useRef, useCallback } from "react";
import { Calendar, CheckOct, CrossOct, Flame, Bulb } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playWrong } from "../sound";
import { haptic } from "../mobile/haptics";
import { formatClock } from "../mobile/layout";
import { monoNow, serverNow, syncServerClock } from "../mobile/clock";
import { syncDailyReminders, noteDailySolved } from "../notifications";
import { primeKeyboard } from "../mobile/keyboard";
import GameHeader from "../components/GameHeader";
import useGameRewards from "../hooks/useGameRewards";
import { CaesarWheel, AtbashMirror, KeyLengthView, useCountdown, AnswerInput } from "./CipherGame";

const VARIANT_LABEL = { caesar: "Caesar", atbash: "Atbash", vigenere: "Vigenère" };

// Server time, not the phone's clock - changing the device date can't fake a new day.
function untilReset(iso) {
  const ms = new Date(iso).getTime() - serverNow();
  if (ms <= 0) return "any second now";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function TodayBoard() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get("/leaderboard/daily").then((res) => setRows(res.data.leaderboard)).catch(() => setRows([]));
  }, []);
  if (!rows) return null;
  return (
    <div className="daily-board">
      <h3>Fastest today</h3>
      {rows.length === 0 ? (
        <p className="empty-state">Nobody's cracked it yet.</p>
      ) : (
        <ol>
          {rows.slice(0, 5).map((r) => (
            <li key={r.rank}>
              <span className="daily-board-rank">#{r.rank}</span>
              <span className="daily-board-name">{r.username}</span>
              <span className="daily-board-time">{formatClock(r.seconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DailyGame() {
  const { applyResult, toasts } = useGameRewards("daily", "Daily Cipher");
  const [status, setStatus] = useState(null);
  const [round, setRound] = useState(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answerRef = useRef("");
  const submittedRef = useRef(false);
  answerRef.current = answer;

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get("/daily");
      setStatus(res.data);
      syncDailyReminders(res.data);
      if (res.data.round) setRound({ ...res.data.round, receivedAt: monoNow() });
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  const [, setTick] = useState(0);

  useEffect(() => {
    syncServerClock().then(loadStatus);
  }, [loadStatus]);

  // Live countdown to the next cipher; when it hits zero, ask the server what day it is.
  useEffect(() => {
    if (!status?.resets_at) return undefined;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (new Date(status.resets_at).getTime() - serverNow() <= 0) loadStatus();
    }, 30000);
    return () => clearInterval(id);
  }, [status, loadStatus]);

  const start = async () => {
    primeKeyboard();
    setBusy(true);
    try {
      const res = await api.post("/daily/start");
      setRound({ ...res.data, receivedAt: monoNow() });
      submittedRef.current = false;
      haptic("select");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = useCallback(async () => {
    if (!round || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    try {
      const res = await api.post(`/daily/rounds/${round.round_id}/submit`, { answer: answerRef.current });
      setResult(res.data);
      if (res.data.correct) {
        noteDailySolved(res.data.seconds);
        playCorrect();
        haptic("win");
      } else {
        playWrong();
        haptic("error");
      }
      applyResult(res.data);
      loadStatus();
    } catch (err) {
      submittedRef.current = false;
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [round, applyResult, loadStatus]);

  const playing = Boolean(round) && !result;
  const timeLeft = useCountdown(round, playing, submit);

  return (
    <div className="game-screen daily-game">
      {toasts}
      <GameHeader title="Daily Cipher" modeKey="daily">
        {playing && <div className={`timer${timeLeft <= 20 ? " warning" : ""}`}>{formatClock(timeLeft)}</div>}
      </GameHeader>

      {error && <p className="error">{error}</p>}

      <div className="daily-meta">
        {status && (
          <>
            <span>
              <Calendar size={16} /> {status.day} · {VARIANT_LABEL[status.variant]}
            </span>
            <span className={status.streak > 0 ? "daily-streak hot" : "daily-streak"}>
              <Flame size={16} /> {status.streak}-day streak
            </span>
          </>
        )}
      </div>

      <div className="game-stage">
        {!status && !error && <div className="loading-inline">Loading today's cipher</div>}

        {status && !round && !result && (
          <div className="rush-intro">
            {status.played ? (
              <>
                <div className="rush-intro-icon">{status.solved ? <CheckOct size={34} /> : <CrossOct size={34} />}</div>
                <h2>{status.solved ? `Cracked in ${formatClock(status.seconds)}.` : "Today got away from you."}</h2>
                <p>Next cipher in {untilReset(status.resets_at)}.</p>
              </>
            ) : (
              <>
                <div className="rush-intro-icon">
                  <Calendar size={34} />
                </div>
                <h2>One shot. Same cipher for everyone.</h2>
                <p>
                  Today's a {VARIANT_LABEL[status.variant]}. You get three minutes and one answer.
                  {status.solvers_today > 0 && ` ${status.solvers_today} cracked it so far.`}
                </p>
                <button className="btn-primary" onClick={start} disabled={busy}>
                  Start the clock
                </button>
              </>
            )}
            <TodayBoard />
          </div>
        )}

        {round && (
          <div className="puzzle-content">
            <div className="encrypted-text">{round.ciphertext}</div>
            <div className="hint-section">
              <div className="hint-icon">
                <Bulb size={20} />
              </div>
              <div className="hint-text">{round.free_hint}</div>
            </div>
            {round.variant === "caesar" && <CaesarWheel />}
            {round.variant === "atbash" && <AtbashMirror />}
            {round.variant === "vigenere" && <KeyLengthView ciphertext={round.ciphertext} keyLength={round.key_length} />}

            {!result && (
              <form
                className="answer-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (answer.trim()) submit();
                }}
              >
                <AnswerInput value={answer} onChange={setAnswer} disabled={!playing || busy} focusOnMount />
                <button type="submit" className="submit-btn" disabled={!playing || busy || !answer.trim()}>
                  Lock it in
                </button>
              </form>
            )}

            {result && (
              <div className={`result ${result.correct ? "correct" : "wrong"}`} role="status">
                <div className="result-status">
                  {result.correct ? <CheckOct size={20} color="#4ade80" /> : <CrossOct size={20} color="#f87171" />}
                  {result.correct ? `Cracked in ${formatClock(result.seconds)}.` : result.timed_out ? "Out of time." : "Not it."}
                </div>
                <div className="result-score">+{result.score}</div>
                {result.correct && (
                  <div className="result-breakdown">
                    Speed +{result.time_bonus}
                    {result.streak_bonus > 0 && ` · streak +${result.streak_bonus}`} · {result.streak}-day streak
                  </div>
                )}
                <div className="result-explanation">
                  It said <strong>{result.plaintext}</strong>
                  {result.shift != null && ` (ROT-${result.shift})`}
                  {result.key && ` (key: ${result.key})`}.
                </div>
                <TodayBoard />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DailyGame;
