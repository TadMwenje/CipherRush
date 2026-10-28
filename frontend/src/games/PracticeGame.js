import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bulb, Check, CheckOct, Close, Confetti, CrossOct, Flame, Hourglass, Shuffle, SignalOff } from "../glyphs";
import { playCorrect, playDefeat, playVictory, playWrong } from "../sound";
import { haptic } from "../mobile/haptics";
import { primeKeyboard } from "../mobile/keyboard";
import { useOnline } from "../mobile/hooks";
import GameHeader from "../components/GameHeader";
import { afterBreak, noteRoundFinished } from "../ads/pacing";
import { AnswerInput, CaesarWheel } from "./CipherGame";
import Match3Board, { useMatch3Animator } from "./Match3Board";
import { checkCipher, cipherRound, newSeed, seededRng, trueFalseRound } from "../practice/engine";
import * as match3 from "../practice/match3";

const MODES = [
  { key: "caesar", label: "Caesar" },
  { key: "match3", label: "Match-3" },
  { key: "truefalse", label: "True/False" },
];

// Practice rounds count toward interstitial pacing like scored ones.
const breakThen = (fn) => () => {
  noteRoundFinished();
  afterBreak(fn)();
};

const CAESAR_HINT = "Every letter moved the same number of places. Try a shift that turns a short word into a real one.";

export function PracticeBanner({ online }) {
  return (
    <div className="practice-banner" role="status">
      {!online && <SignalOff size={16} />}
      {online
        ? "Practice Mode — unscored. Scores and XP only come from the regular games."
        : "Practice Mode (Offline) — Scores and XP are disabled while offline."}
    </div>
  );
}

function CipherPractice({ variant, rng }) {
  const [round, setRound] = useState(() => cipherRound(variant, rng));
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null);
  const primedRef = useRef(false);

  const submit = (e) => {
    e.preventDefault();
    if (!answer.trim() || result) return;
    const correct = checkCipher(round, answer);
    setResult({ correct });
    if (correct) {
      playCorrect();
      haptic("success");
    } else {
      playWrong();
      haptic("error");
    }
  };

  const next = () => {
    primeKeyboard();
    primedRef.current = true;
    setRound(cipherRound(variant, rng, { avoid: round.plaintext }));
    setAnswer("");
    setResult(null);
  };

  return (
    <div className="puzzle-content">
      <div className="encrypted-text" aria-label="Ciphertext">
        {round.ciphertext}
      </div>
      <div className="hint-section">
        <div className="hint-icon">
          <Bulb size={20} />
        </div>
        <div className="hint-text">
          <div>{CAESAR_HINT}</div>
        </div>
      </div>

      <CaesarWheel />

      {!result && (
        <form className="answer-section" onSubmit={submit}>
          <AnswerInput value={answer} onChange={setAnswer} focusOnMount={primedRef.current} />
          <div className="answer-actions">
            <button type="button" className="hint-btn" onClick={() => setResult({ correct: false, gaveUp: true })}>
              Show me
            </button>
            <button type="submit" className="submit-btn" disabled={!answer.trim()}>
              Crack it
            </button>
          </div>
        </form>
      )}

      {result && (
        <div className={`result ${result.correct ? "correct" : "wrong"}`} role="status">
          <div className="result-status">
            {result.correct ? <CheckOct size={20} color="#4ade80" /> : <CrossOct size={20} color="#f87171" />}
            {result.correct ? "Cracked." : result.gaveUp ? "Here it is." : "Not it."}
          </div>
          <div className="result-explanation">
            It said <strong>{round.plaintext}</strong>
            {round.shift != null && ` (ROT-${round.shift})`}.
          </div>
          <button className="next-btn" onClick={breakThen(next)}>
            Next cipher
          </button>
        </div>
      )}
    </div>
  );
}

function TrueFalsePractice({ rng }) {
  const [deck, setDeck] = useState(() => trueFalseRound(rng));
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);

  const done = index >= deck.length;
  const statement = deck[index];

  const answer = (value) => {
    if (feedback || !statement) return;
    const correct = value === statement.answer;
    setFeedback({ correct, explanation: statement.explanation });
    if (correct) {
      setCorrectCount((c) => c + 1);
      playCorrect();
      haptic("success");
    } else {
      playWrong();
      haptic("error");
    }
  };

  const next = () => {
    setFeedback(null);
    setIndex((i) => i + 1);
  };

  const again = () => {
    setDeck(trueFalseRound(rng));
    setIndex(0);
    setCorrectCount(0);
    setFeedback(null);
  };

  if (done) {
    return (
      <div className="match3-result won">
        <h2 className="match3-result-heading">
          {correctCount} out of {deck.length}.
        </h2>
        <p className="match3-result-copy">Practice round. Nothing was scored.</p>
        <div className="match3-result-actions">
          <button className="restart-btn" onClick={breakThen(again)}>
            Ten more
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${((index + (feedback ? 1 : 0)) / deck.length) * 100}%` }} />
      </div>
      <div className="binary-statement">{statement.statement}</div>
      {!feedback ? (
        <div className="binary-choices">
          <button className="binary-choice false" onClick={() => answer(false)}>
            <span className="binary-choice-icon">
              <Close size={28} color="#f87171" />
            </span>
            False
          </button>
          <button className="binary-choice true" onClick={() => answer(true)}>
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
            {feedback.correct ? "Right." : "Wrong."}
          </div>
          <p>{feedback.explanation}</p>
          <button className="next-btn" onClick={breakThen(next)}>
            {index + 1 < deck.length ? "Next" : "See how you did"}
          </button>
        </div>
      )}
    </>
  );
}

function Match3Practice({ rng }) {
  const { board, setBoard, reset, rejectSwap, playSteps, poppingCells, droppingColumns, invalidCells, cascade } =
    useMatch3Animator();
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(match3.MOVES);
  const [busy, setBusy] = useState(false);
  const [reshuffled, setReshuffled] = useState(false);
  const [outcome, setOutcome] = useState(null); // "won" | "lost"

  const deal = useCallback(() => {
    reset(match3.generateBoard(rng));
    setScore(0);
    setMovesLeft(match3.MOVES);
    setOutcome(null);
  }, [reset, rng]);

  useEffect(deal, [deal]);

  const attemptSwap = async (a, b) => {
    if (busy || outcome || !board) return;
    const attempt = match3.swapped(board, a, b);
    setBusy(true);
    if (!match3.findMatches(attempt).size) {
      await rejectSwap(board, attempt, a, b);
      setBusy(false);
      return;
    }
    setBoard(attempt);
    const res = match3.resolveSwap(board, a, b, rng);
    await playSteps(res.steps);
    const nextScore = score + res.gained;
    const nextMoves = movesLeft - 1;
    setScore(nextScore);
    setMovesLeft(nextMoves);
    if (res.reshuffled) {
      setReshuffled(true);
      setBoard(res.board);
      setTimeout(() => setReshuffled(false), 1400);
    }
    if (nextScore >= match3.TARGET || nextMoves <= 0) {
      const won = nextScore >= match3.TARGET;
      setOutcome(won ? "won" : "lost");
      if (won) {
        playVictory();
        haptic("win");
      } else {
        playDefeat();
        haptic("error");
      }
    }
    setBusy(false);
  };

  return (
    <div className="match3-game">
      <div className="game-stats">
        <div className="stat">
          <span className="stat-label">Score</span> {score}
        </div>
        <div className={`stat${movesLeft <= 3 && !outcome ? " stat-warning" : ""}`}>
          <span className="stat-label">Moves</span> {movesLeft}
        </div>
        <div className="stat">
          <span className="stat-label">Target</span> {match3.TARGET}
        </div>
      </div>
      <div className="progress-bar match3-target-bar">
        <div className="progress-fill" style={{ width: `${Math.min(100, Math.round((score / match3.TARGET) * 100))}%` }} />
      </div>
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
      <div className="match3-stage">
        {board && (
          <Match3Board
            board={board}
            locked={busy || !!outcome}
            finished={!!outcome}
            poppingCells={poppingCells}
            droppingColumns={droppingColumns}
            invalidCells={invalidCells}
            onSwap={attemptSwap}
          />
        )}
        {outcome && (
          <div className={`match3-result ${outcome}`}>
            <h2 className="match3-result-heading">
              {outcome === "won" ? <Confetti size={24} /> : <Hourglass size={24} />}
              {outcome === "won" ? "Board cleared." : "Out of moves."}
            </h2>
            <p className="match3-result-copy">
              {outcome === "won"
                ? `${movesLeft} moves to spare. Practice round, nothing scored.`
                : `${match3.TARGET - score} short. Practice round, nothing scored.`}
            </p>
            <div className="match3-result-actions">
              <button className="restart-btn" onClick={breakThen(deal)}>
                New board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** /practice - works with no account and no connection. */
function PracticeGame() {
  const online = useOnline();
  const [mode, setMode] = useState("caesar");
  // One seeded generator per visit; every round after that comes from it.
  const rng = useMemo(() => seededRng(newSeed()), []);
  const pickMode = useCallback((key) => {
    haptic("select");
    setMode(key);
  }, []);

  return (
    <div className="game-screen practice-game">
      <GameHeader title="Practice" />
      <PracticeBanner online={online} />

      <div className="segmented" role="tablist" aria-label="Practice mode">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={mode === m.key}
            className={`segmented-btn${mode === m.key ? " active" : ""}`}
            onClick={() => pickMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="game-stage">
        {mode === "truefalse" && <TrueFalsePractice key="tf" rng={rng} />}
        {mode === "match3" && <Match3Practice key="match3" rng={rng} />}
        {mode === "caesar" && <CipherPractice key="caesar" variant="caesar" rng={rng} />}
      </div>
    </div>
  );
}

export default PracticeGame;
