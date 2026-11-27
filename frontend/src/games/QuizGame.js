import React, { useState, useEffect } from "react";
import { Bulb, CheckOct, CrossOct } from "../glyphs";
import api, { errorMessage } from "../api";
import { playCorrect, playHint, playTap, playWrong } from "../sound";
import { haptic } from "../mobile/haptics";
import GameLevelBar from "../components/GameLevelBar";
import GameHeader from "../components/GameHeader";
import { adsAvailable } from "../ads/admob";
import { afterBreak } from "../ads/pacing";
import { earnReward } from "../ads/rewards";
import useGameRewards from "../hooks/useGameRewards";
import useRound from "../hooks/useRound";
import { useT } from "../i18n";
import useModeLabel from "../hooks/useModeLabel";

// Topic chips; labels are quiz.cat.<key> in the i18n files.
const CATEGORIES = ["phishing", "social_engineering", "cryptography", "malware", "incident_response"];

function QuizGame() {
  const { gameProgress, applyResult, toasts } = useGameRewards("quiz");
  const t = useT();
  const title = useModeLabel("quiz");
  const { round, loading, error, setError, startNew } = useRound("quiz", { category: "phishing" });
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  // Hints strike out wrong options. The server picks which, and counts them:
  // the first few a round are free, then each one is a rewarded video.
  const [removed, setRemoved] = useState({});
  const [freeLeft, setFreeLeft] = useState(0);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    setCurrent(0);
    setAnswers([]);
    setResult(null);
    setRemoved(round?.removed || {});
    setFreeLeft(round?.free_hints_left ?? 0);
  }, [round]);

  const category = round?.category || "phishing";
  const questions = round?.questions || [];
  const question = questions[current];

  const select = (optionIndex) => {
    const next = [...answers];
    next[current] = optionIndex;
    setAnswers(next);
    playTap();
    haptic("select");
  };

  const submit = async () => {
    setBusy(true);
    try {
      // Only the round id and the picked option indexes go up - the server grades them.
      const { data } = await api.post(`/games/quiz/rounds/${round.round_id}/submit`, { answers });
      setResult(data);
      if (data.passed) {
        playCorrect();
        haptic("success");
      } else {
        playWrong();
        haptic("error");
      }
      applyResult(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const struck = removed[String(current)] || [];
  const canHint = question && question.options.length - struck.length > 2;

  const hint = async () => {
    const paid = freeLeft <= 0;
    if (paid) setWatching(true);
    try {
      const body = { question: current };
      if (paid) body.reward_id = await earnReward("hint", round.round_id);
      const { data } = await api.post(`/games/quiz/rounds/${round.round_id}/hint`, body);
      setRemoved(data.removed);
      setFreeLeft(data.free_hints_left);
      const gone = data.removed[String(current)] || [];
      if (gone.includes(answers[current])) {
        const nextAnswers = [...answers];
        nextAnswers[current] = undefined;
        setAnswers(nextAnswers);
      }
      playHint();
      haptic("select");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWatching(false);
    }
  };

  const next = () => (current < questions.length - 1 ? setCurrent(current + 1) : submit());

  return (
    <div className="game-screen quiz-game">
      {toasts}
      <GameHeader title={title} modeKey="quiz" />
      <GameLevelBar progress={gameProgress} />

      <div className="chip-row" role="tablist" aria-label={t("quiz.topic")}>
        {CATEGORIES.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={category === key}
            className={`category-btn ${category === key ? "active" : ""}`}
            onClick={() => {
              if (key !== category || result) startNew({ category: key });
            }}
            disabled={busy || loading}
          >
            {t(`quiz.cat.${key}`)}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="game-stage">
        {!round && !error && <div className="loading-inline">{t("quiz.loading")}</div>}

        {question && !result && (
          <div className="question-content">
            <div className="question-header">
              <div className="question-number">{t("quiz.of", { i: current + 1, n: questions.length })}</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
              </div>
            </div>

            <div className="question-text">{question.question}</div>

            <div className="options">
              {question.options.map((option, index) =>
                struck.includes(index) ? (
                  <button
                    key={option}
                    className="option-btn struck"
                    disabled
                    aria-label={t("quiz.ruledOut", { option })}
                  >
                    {option}
                  </button>
                ) : (
                  <button
                    key={option}
                    className={`option-btn ${answers[current] === index ? "selected" : ""}`}
                    onClick={() => select(index)}
                    aria-pressed={answers[current] === index}
                  >
                    {option}
                  </button>
                ),
              )}
            </div>

            {canHint && freeLeft > 0 && (
              <button type="button" className="hint-btn quiz-hint-btn" onClick={hint} disabled={busy}>
                <Bulb size={16} />
                {t("quiz.freeHint", { n: freeLeft })}
              </button>
            )}
            {canHint && freeLeft <= 0 && adsAvailable() && (
              <button type="button" className="free-hint-btn" onClick={hint} disabled={busy || watching}>
                <Bulb size={16} />
                {watching ? t("g.loadingVideo") : t("quiz.videoHint")}
              </button>
            )}
            {canHint && freeLeft <= 0 && !adsAvailable() && (
              <button type="button" className="hint-btn quiz-hint-btn" disabled>
                <Bulb size={16} />
                {t("quiz.noHints")}
              </button>
            )}

            <button className="next-btn" onClick={next} disabled={answers[current] === undefined || busy}>
              {current < questions.length - 1 ? t("g.next") : t("quiz.lockIn")}
            </button>
          </div>
        )}

        {result && (
          <div className="quiz-result">
            <div className="result-header">
              <div className="result-score">
                {result.correct_count}/{result.total_questions}
              </div>
              <div className="result-stats">
                +{t("g.pts", { n: result.score })}
                {result.passed ? "" : ` · ${t("quiz.toClear")}`}
              </div>
            </div>

            <ol className="quiz-review">
              {result.results.map((r) => {
                const q = questions[r.index];
                return (
                  <li key={r.index} className={r.correct ? "correct" : "wrong"}>
                    <div className="quiz-review-q">
                      {r.correct ? <CheckOct size={16} color="#4ade80" /> : <CrossOct size={16} color="#f87171" />}
                      {q.question}
                    </div>
                    {!r.correct && (
                      <div className="quiz-review-answer">
                        {t("quiz.youSaid")} {q.options[r.your_answer]}
                        <br />
                        {t("quiz.answer")} <strong>{q.options[r.correct_answer]}</strong>
                      </div>
                    )}
                    <div className="quiz-review-explanation">{r.explanation}</div>
                  </li>
                );
              })}
            </ol>

            <button className="retry-btn" onClick={afterBreak(() => startNew({ category }))}>
              {t("g.fiveMore")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuizGame;
