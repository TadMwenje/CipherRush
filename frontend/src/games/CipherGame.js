import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bulb, CheckOct, CrossOct, Minus, Plus, Key } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playWrong } from "../sound";
import { haptic } from "../mobile/haptics";
import { formatClock, shiftAfterDrag } from "../mobile/layout";
import { monoNow } from "../mobile/clock";
import { primeKeyboard, claimFocus } from "../mobile/keyboard";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const WARNING_SECONDS = 20;

const VARIANTS = [
  { key: "caesar", label: "Caesar" },
  { key: "atbash", label: "Atbash" },
  { key: "vigenere", label: "Vigenère", note: "1.5x" },
];

// Caesar wheel: drag the strip sideways (or use the buttons) to line up a shift.
export function CaesarWheel() {
  const [shift, setShift] = useState(3);
  const drag = useRef(null);
  const stripRef = useRef(null);

  const onPointerDown = (e) => {
    const cell = stripRef.current ? stripRef.current.offsetWidth / 13 : 24;
    drag.current = { x: e.clientX, start: shift, cell };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const next = shiftAfterDrag(drag.current.start, e.clientX - drag.current.x, drag.current.cell);
    if (next !== shift) {
      setShift(next);
      haptic("tap");
    }
  };
  const endDrag = () => {
    drag.current = null;
  };
  const change = (d) => {
    setShift((s) => (s + d + 26) % 26);
    haptic("tap");
  };

  return (
    <div className="cipher-tool">
      <div className="cipher-tool-head">
        <span>Cipher wheel</span>
        <div className="cipher-tool-controls">
          <button type="button" onClick={() => change(-1)} aria-label="Shift down one">
            <Minus size={16} />
          </button>
          <span className="cipher-tool-value" aria-live="polite">
            ROT-{shift}
          </span>
          <button type="button" onClick={() => change(1)} aria-label="Shift up one">
            <Plus size={16} />
          </button>
        </div>
      </div>
      <div
        ref={stripRef}
        className="alphabet-strip draggable"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        aria-label="Cipher wheel shift"
        aria-valuemin={0}
        aria-valuemax={25}
        aria-valuenow={shift}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") change(1);
          if (e.key === "ArrowLeft") change(-1);
        }}
      >
        {ALPHABET.split("").map((ch, i) => (
          <div key={ch} className="alphabet-pair">
            <span className="alphabet-cipher">{ALPHABET[(i + shift) % 26]}</span>
            <span className="alphabet-plain">{ch}</span>
          </div>
        ))}
      </div>
      <div className="cipher-tool-legend">Drag the strip. Top row is what you see, bottom is what it means.</div>
    </div>
  );
}

export function AtbashMirror() {
  return (
    <div className="cipher-tool">
      <div className="cipher-tool-head">
        <span>Mirror alphabet</span>
      </div>
      <div className="alphabet-strip">
        {ALPHABET.split("").map((ch, i) => (
          <div key={ch} className="alphabet-pair">
            <span className="alphabet-cipher">{ch}</span>
            <span className="alphabet-plain">{ALPHABET[25 - i]}</span>
          </div>
        ))}
      </div>
      <div className="cipher-tool-legend">Same move both ways. Encode and decode are identical.</div>
    </div>
  );
}

export function KeyLengthView({ ciphertext, keyLength }) {
  let letterIndex = 0;
  return (
    <div className="cipher-tool">
      <div className="cipher-tool-head">
        <span>
          <Key size={14} /> Key length {keyLength}
        </span>
      </div>
      <div className="keylength-view">
        {ciphertext.split("").map((ch, i) => {
          if (!ALPHABET.includes(ch)) return <span key={i} className="keylength-space" />;
          const slot = letterIndex++ % keyLength;
          return (
            <span key={i} className={`keylength-letter slot-${slot % 6}`}>
              {ch}
              <sub>{slot + 1}</sub>
            </span>
          );
        })}
      </div>
      <div className="cipher-tool-legend">
        Same number, same key letter. Crack each numbered group like its own Caesar.
      </div>
    </div>
  );
}

/** Ciphertext + answer box + timer, shared by Cipher Puzzles and the Daily Cipher. */
export function useCountdown(round, active, onExpire) {
  const [timeLeft, setTimeLeft] = useState(0);
  const deadline = useRef(null);
  const expired = useRef(false);

  useEffect(() => {
    if (!round) return;
    const seconds = round.time_left ?? round.time_limit;
    deadline.current = round.receivedAt + seconds * 1000;
    expired.current = false;
    setTimeLeft(seconds);
  }, [round]);

  useEffect(() => {
    if (!round || !active) return undefined;
    const tick = () => {
      const remaining = (deadline.current - monoNow()) / 1000;
      setTimeLeft(Math.max(0, remaining));
      if (remaining <= 0 && !expired.current) {
        expired.current = true;
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [round, active, onExpire]);

  return timeLeft;
}

/**
 * Answer field. `focusOnMount` pairs with primeKeyboard(): the tap that led
 * here already raised the keyboard on a proxy input, and this hands focus over
 * so the keyboard stays up on iOS. Scrolling above the keyboard is handled
 * globally (mobile/keyboard.js).
 */
export function AnswerInput({ value, onChange, disabled, placeholder = "Type the plaintext", focusOnMount = false, inputRef }) {
  const ref = useRef(null);
  useEffect(() => {
    if (inputRef) inputRef.current = ref.current;
  });
  useEffect(() => {
    if (focusOnMount && !disabled) claimFocus(ref.current);
  }, [focusOnMount, disabled]);
  return (
    <input
      ref={ref}
      type="text"
      className="answer-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      disabled={disabled}
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="go"
      aria-label="Your answer"
    />
  );
}

function CipherGame() {
  const { gameProgress, applyResult, toasts } = useGameRewards("cipher", "Cipher Puzzles");
  const { round, loading, error, setError, startNew } = useRound("cipher", { variant: "caesar" });
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const answerRef = useRef("");
  const submittedRef = useRef(false);
  const primedRef = useRef(false);
  answerRef.current = answer;

  useEffect(() => {
    setResult(null);
    setAnswer("");
    setHints(round?.hints_shown || []);
    submittedRef.current = false;
  }, [round]);

  const variant = round?.variant || "caesar";

  const submit = useCallback(async () => {
    if (!round || submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    try {
      const res = await api.post(`/games/cipher/rounds/${round.round_id}/submit`, { answer: answerRef.current });
      setResult(res.data);
      if (res.data.correct) {
        playCorrect();
        haptic("success");
      } else {
        playWrong();
        haptic("error");
      }
      applyResult(res.data);
    } catch (err) {
      submittedRef.current = false;
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [round, applyResult, setError]);

  const active = Boolean(round) && !result;
  const timeLeft = useCountdown(round, active, submit);

  const requestHint = async () => {
    if (!round) return;
    try {
      const res = await api.post(`/games/cipher/rounds/${round.round_id}/hint`);
      setHints((h) => [...h, res.data.hint]);
      haptic("select");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const pickVariant = (key) => {
    if (key === variant && !result) return;
    haptic("select");
    startNew({ variant: key });
  };

  const hintsLeft = round ? round.hints_available - hints.length : 0;
  const warning = active && timeLeft <= WARNING_SECONDS;

  return (
    <div className="game-screen cipher-game">
      {toasts}
      <GameHeader title="Cipher Puzzles" modeKey="cipher">
        {round && <div className={`timer${warning ? " warning" : ""}`}>{formatClock(timeLeft)}</div>}
      </GameHeader>

      <div className="segmented" role="tablist" aria-label="Cipher type">
        {VARIANTS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={variant === v.key}
            className={`segmented-btn${variant === v.key ? " active" : ""}`}
            onClick={() => pickVariant(v.key)}
            disabled={loading || busy}
          >
            {v.label}
            {v.note && <span className="segmented-note">{v.note}</span>}
          </button>
        ))}
      </div>

      <GameLevelBar progress={gameProgress} />
      {error && <p className="error">{error}</p>}

      <div className="game-stage">
        {!round && !error && <div className="loading-inline">Loading cipher</div>}
        {round && (
          <div className="puzzle-content">
            <div className="encrypted-text" aria-label="Ciphertext">
              {round.ciphertext}
            </div>

            <div className="hint-section">
              <div className="hint-icon">
                <Bulb size={20} />
              </div>
              <div className="hint-text">
                <div>{round.free_hint}</div>
                {hints.map((h) => (
                  <div key={h} className="hint-paid">
                    {h}
                  </div>
                ))}
              </div>
            </div>

            {variant === "caesar" && <CaesarWheel />}
            {variant === "atbash" && <AtbashMirror />}
            {variant === "vigenere" && <KeyLengthView ciphertext={round.ciphertext} keyLength={round.key_length} />}

            {!result && (
              <form
                className="answer-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (answer.trim()) submit();
                }}
              >
                <AnswerInput value={answer} onChange={setAnswer} disabled={!active || busy} focusOnMount={primedRef.current} />
                <div className="answer-actions">
                  <button type="button" className="hint-btn" onClick={requestHint} disabled={!active || busy || hintsLeft <= 0}>
                    <Bulb size={16} />
                    {hintsLeft > 0 ? `Hint −${round.hint_penalty_pct}%` : "No hints left"}
                  </button>
                  <button type="submit" className="submit-btn" disabled={!active || busy || !answer.trim()}>
                    Crack it
                  </button>
                </div>
              </form>
            )}

            {result && (
              <div className={`result ${result.correct ? "correct" : "wrong"}`} role="status">
                <div className="result-status">
                  {result.correct ? <CheckOct size={20} color="#4ade80" /> : <CrossOct size={20} color="#f87171" />}
                  {result.correct ? "Cracked." : result.timed_out ? "Out of time." : "Not it."}
                </div>
                <div className="result-score">+{result.score}</div>
                {result.correct && (
                  <div className="result-breakdown">
                    Speed +{result.time_bonus}
                    {result.hint_penalty > 0 && ` · hints −${result.hint_penalty}`}
                  </div>
                )}
                <div className="result-explanation">
                  It said <strong>{result.plaintext}</strong>
                  {result.shift != null && ` (ROT-${result.shift})`}
                  {result.key && ` (key: ${result.key})`}.
                </div>
                <button
                  className="next-btn"
                  onClick={() => {
                    primeKeyboard();
                    primedRef.current = true;
                    startNew({ variant });
                  }}
                >
                  Next cipher
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CipherGame;
