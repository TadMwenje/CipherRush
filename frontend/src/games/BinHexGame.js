import React, { useState, useEffect } from "react";
import { Bulb, Check, Close, Sparkle, Confetti, Table } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playWrong, playVictory } from "../sound";
import { haptic } from "../mobile/haptics";
import { primeKeyboard } from "../mobile/keyboard";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import { adsAvailable } from "../ads/admob";
import { afterBreak } from "../ads/pacing";
import { earnReward } from "../ads/rewards";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";
import { AnswerInput } from "./CipherGame";
import { useT } from "../i18n";
import useModeLabel from "../hooks/useModeLabel";

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const PLACE_VALUES = [128, 64, 32, 16, 8, 4, 2, 1];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Strip the notation (0x, \x, %, nibble spaces) down to bare digits.
export function bareDigits(code) {
  return code.replace(/^0x/i, "").replace(/^\\x/i, "").replace(/^%/, "").replace(/\s/g, "");
}

function ByteExplainer({ code, base }) {
  const t = useT();
  const digits = bareDigits(code);
  if (base === 2) {
    const bits = digits.padStart(8, "0");
    const value = parseInt(bits, 2);
    return (
      <div className="byte-explainer">
        {digits.length < 8 && <div className="byte-note">{t("bh.pad", { n: digits.length })}</div>}
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
        {code !== digits && <div className="byte-note">{t("bh.prefix", { hex: digits.toUpperCase() })}</div>}
        <div className="byte-sum">
          {hi}×16 + {lo} = {parseInt(hi, 16) * 16} + {parseInt(lo, 16)} = {parseInt(digits, 16)}
        </div>
        <div className="byte-note">A=10 · B=11 · C=12 · D=13 · E=14 · F=15</div>
      </div>
    );
  }
  return (
    <div className="byte-explainer">
      <div className="byte-sum">{t("bh.decimal", { n: digits })}</div>
    </div>
  );
}

function AsciiTable() {
  const t = useT();
  return (
    <div className="ascii-table" role="table" aria-label={t("bh.asciiRef")}>
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
  const { gameProgress, applyResult, toasts } = useGameRewards("binhex");
  const t = useT();
  const title = useModeLabel("binhex");
  const { round, error, setError, startNew } = useRound("binhex");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  // Video hints: the first letter of a word, one per word (server-verified, half points).
  const [hints, setHints] = useState({});
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!round) return;
    setHints(round.hints || {});
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

  const videoHint = async () => {
    if (!item || watching || feedback) return;
    setWatching(true);
    setError("");
    try {
      const rewardId = await earnReward("hint", round.round_id);
      const { data } = await api.post(`/games/binhex/rounds/${round.round_id}/hint`, { index, reward_id: rewardId });
      setHints((h) => ({ ...h, [String(data.index)]: data.letter }));
      haptic("select");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWatching(false);
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
      <GameHeader title={title} modeKey="binhex" />
      <GameLevelBar progress={gameProgress} />
      {error && <p className="error">{error}</p>}

      {showingWord && (
        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">{t("g.word")}</span> {index + 1}/{round.items.length}
          </div>
          <div className="stat stat-format">{item.label}</div>
        </div>
      )}

      <div className="game-stage">
        {!round && !error && <div className="loading-inline">{t("bh.loading")}</div>}

        {showingWord && (
          <div className="binhex-card">
            <div className="binhex-raw" aria-label={t("bh.encoded")}>
              {item.display}
            </div>
            <p className="binhex-instructions">{t("bh.instructions")}</p>
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
              <Table size={16} /> {showTable ? t("bh.hideTable") : t("bh.showTable")}
            </button>
            {showTable && <AsciiTable />}

            {!feedback && hints[String(index)] && (
              <p className="binhex-hint" role="status">
                <Bulb size={16} /> {t("bh.hintLetter", { letter: hints[String(index)] })}
              </p>
            )}
            {!feedback && !hints[String(index)] && adsAvailable() && (
              <button type="button" className="free-hint-btn" onClick={videoHint} disabled={busy || watching}>
                <Bulb size={16} /> {watching ? t("g.loadingVideo") : t("bh.videoHint")}
              </button>
            )}

            {!feedback ? (
              <form className="answer-section" onSubmit={submit}>
                <AnswerInput
                  value={answer}
                  onChange={setAnswer}
                  placeholder={t("bh.placeholder", { n: item.codes.length })}
                  focusOnMount={index > 0}
                />
                <button type="submit" className="submit-btn" disabled={busy || !answer.trim()}>
                  {t("bh.decode")}
                </button>
              </form>
            ) : (
              <div className={`binary-feedback ${feedback.correct ? "correct" : "wrong"}`} role="status">
                <div className="binary-feedback-badge">
                  {feedback.correct ? <Check size={20} color="#4ade80" /> : <Close size={20} color="#f87171" />}
                  {feedback.correct ? t("bh.decoded", { n: feedback.points }) : t("bh.itWas", { word: feedback.word })}
                </div>
                <div className="binhex-breakdown">
                  {feedback.breakdown.map((b, i) => (
                    <span key={i}>
                      {b.code} → {b.decimal} → <strong>{b.letter}</strong>
                    </span>
                  ))}
                </div>
                <button className="next-btn" onClick={feedback.finished ? () => setFeedback(null) : nextItem}>
                  {feedback.finished ? t("bh.seeResults") : t("bh.nextWord")}
                </button>
              </div>
            )}
          </div>
        )}

        {result && !feedback && (
          <div className="match3-result won">
            <h2 className="match3-result-heading">
              {result.perfect ? <Sparkle size={24} /> : <Confetti size={24} />}
              {result.perfect ? t("bh.perfect") : t("bh.outOf", { n: result.correct_count, total: result.total_questions })}
            </h2>
            <div className="final-score">+{result.score}</div>
            {!result.passed && <p className="match3-result-copy">{capitalize(t("g.needed", { n: 3 }))}.</p>}
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={afterBreak(() => startNew())}>
                {t("g.fiveMore")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BinHexGame;
