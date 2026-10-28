import React, { useState, useEffect } from "react";
import { Check, Close, Sparkle, Confetti, Table } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playWrong, playVictory } from "../sound";
import { haptic } from "../mobile/haptics";
import { primeKeyboard } from "../mobile/keyboard";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import { afterBreak } from "../ads/pacing";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";
import { AnswerInput } from "./CipherGame";

const PLACE_VALUES = [128, 64, 32, 16, 8, 4, 2, 1];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Strip the notation (0x, \x, %, nibble spaces) down to bare digits.
export function bareDigits(code) {
  return code.replace(/^0x/i, "").replace(/^\\x/i, "").replace(/^%/, "").replace(/\s/g, "");
}

function ByteExplainer({ code, base }) {
  const digits = bareDigits(code);
  if (base === 2) {
    const bits = digits.padStart(8, "0");
    const value = parseInt(bits, 2);
    return (
      <div className="byte-explainer">
        {digits.length < 8 && <div className="byte-note">Only {digits.length} bits - pad the front with zeros.</div>}
        <div className="bit-row">
          {bits.split("").map((bit, i) => (
            <div key={i} className={`bit-cell${bit === "1" ? " on" : ""}`}>
              <span className="bit-value">{PLACE_VALUES[i]}</span>
              <span className="bit-digit">{bit}</span>
            </div>
          ))}
        </div>
        <div className="byte-sum">
          {PLACE_VALUES.filter((_, i) => bits[i] === "1").join(" + ")} = {value}
        </div>
      </div>
    );
  }
  if (base === 16) {
    const [hi, lo] = digits.toUpperCase().split("");
    return (
      <div className="byte-explainer">
        {code !== digits && <div className="byte-note">Ignore the prefix - the hex is {digits.toUpperCase()}.</div>}
        <div className="byte-sum">
          {hi}×16 + {lo} = {parseInt(hi, 16) * 16} + {parseInt(lo, 16)} = {parseInt(digits, 16)}
        </div>
        <div className="byte-note">A=10 · B=11 · C=12 · D=13 · E=14 · F=15</div>
      </div>
    );
  }
  return (
    <div className="byte-explainer">
      <div className="byte-sum">{digits} - straight into the ASCII table</div>
    </div>
  );
}

function AsciiTable() {
  return (
    <div className="ascii-table" role="table" aria-label="ASCII reference">
      {LETTERS.map((ch) => {
        const code = ch.charCodeAt(0);
        return (
          <div key={ch} className="ascii-cell" role="row">
            <strong>{ch}</strong>
            <span>{code}</span>
            <span>{code.toString(16).toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}

function BinHexGame() {
  const { gameProgress, applyResult, toasts } = useGameRewards("binhex", "Binary / Hex");
  const { round, error, setError, startNew } = useRound("binhex");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!round) return;
    setIndex(round.answered ?? 0);
    setFeedback(null);
    setResult(null);
    setAnswer("");
    setExpanded(null);
  }, [round]);

  const item = round?.items[index];

  const submit = async (e) => {
    e.preventDefault();
    if (!item || busy || feedback) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/games/binhex/rounds/${round.round_id}/answer`, { index, answer });
      setFeedback(data);
      if (data.correct) {
        playCorrect();
        haptic("success");
      } else {
        playWrong();
        haptic("error");
      }
      if (data.finished) {
        setResult(data.result);
        if (data.result.perfect) playVictory();
        applyResult(data.result);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const nextItem = () => {
    primeKeyboard();
    setFeedback(null);
    setAnswer("");
    setExpanded(null);
    setIndex((i) => i + 1);
  };

  const showingWord = item && !(result && !feedback);

  return (
    <div className="game-screen binhex-game">
      {toasts}
      <GameHeader title="Binary / Hex" modeKey="binhex" />
      <GameLevelBar progress={gameProgress} />
      {error && <p className="error">{error}</p>}

      {showingWord && (
        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">Word</span> {index + 1}/{round.items.length}
          </div>
          <div className="stat stat-format">{item.label}</div>
        </div>
      )}

      <div className="game-stage">
        {!round && !error && <div className="loading-inline">Loading bytes</div>}

        {showingWord && (
          <div className="binhex-card">
            <div className="binhex-raw" aria-label="Encoded word">
              {item.display}
            </div>
            <p className="binhex-instructions">One byte per letter. Tap a byte to see the maths.</p>
            <div className="byte-list">
              {item.codes.map((code, i) => (
                <button
                  key={i}
                  type="button"
                  className={`byte-chip${expanded === i ? " active" : ""}`}
                  onClick={() => {
                    setExpanded(expanded === i ? null : i);
                    haptic("tap");
                  }}
                  aria-expanded={expanded === i}
                >
                  {code}
                </button>
              ))}
            </div>
            {expanded !== null && <ByteExplainer code={item.codes[expanded]} base={item.base} />}

            <button type="button" className="howto-link" onClick={() => setShowTable((s) => !s)}>
              <Table size={16} /> {showTable ? "Hide" : "Show"} ASCII table
            </button>
            {showTable && <AsciiTable />}

            {!feedback ? (
              <form className="answer-section" onSubmit={submit}>
                <AnswerInput
                  value={answer}
                  onChange={setAnswer}
                  placeholder={`${item.codes.length}-letter word`}
                  focusOnMount={index > 0}
                />
                <button type="submit" className="submit-btn" disabled={busy || !answer.trim()}>
                  Decode
                </button>
              </form>
            ) : (
              <div className={`binary-feedback ${feedback.correct ? "correct" : "wrong"}`} role="status">
                <div className="binary-feedback-badge">
                  {feedback.correct ? <Check size={20} color="#4ade80" /> : <Close size={20} color="#f87171" />}
                  {feedback.correct ? `Decoded. +${feedback.points}` : `It was ${feedback.word}.`}
                </div>
                <div className="binhex-breakdown">
                  {feedback.breakdown.map((b, i) => (
                    <span key={i}>
                      {b.code} → {b.decimal} → <strong>{b.letter}</strong>
                    </span>
                  ))}
                </div>
                <button className="next-btn" onClick={feedback.finished ? () => setFeedback(null) : nextItem}>
                  {feedback.finished ? "See results" : "Next word"}
                </button>
              </div>
            )}
          </div>
        )}

        {result && !feedback && (
          <div className="match3-result won">
            <h2 className="match3-result-heading">
              {result.perfect ? <Sparkle size={24} /> : <Confetti size={24} />}
              {result.perfect ? "Every byte, decoded." : `${result.correct_count} of ${result.total_questions}.`}
            </h2>
            <div className="final-score">+{result.score}</div>
            {!result.passed && <p className="match3-result-copy">3 needed to count toward your level.</p>}
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={afterBreak(() => startNew())}>
                Five more
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BinHexGame;
