import React, { useCallback, useEffect, useRef, useState } from "react";
import { playMatch, playInvalid } from "../sound";
import { haptic } from "../mobile/haptics";
import { swipeDirection } from "../mobile/layout";
import GameSymbolIcon from "../icons/GameSymbolIcon";
import { findValidMove } from "../practice/match3";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HINT_DELAY_MS = 7000;

const isAdjacent = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

/**
 * Board state plus the two animations every Match-3 screen needs: the
 * rejected-swap wobble and the pop / drop / cascade playback of a resolved
 * swap (the shape both the server and practice/match3.js return).
 */
export function useMatch3Animator() {
  const [board, setBoard] = useState(null);
  const [poppingCells, setPoppingCells] = useState(new Set());
  const [droppingColumns, setDroppingColumns] = useState([]);
  const [invalidCells, setInvalidCells] = useState(null);
  const [cascade, setCascade] = useState(null);

  const reset = useCallback((next) => {
    setBoard(next);
    setDroppingColumns(next ? Array(next.length).fill(0) : []);
    setPoppingCells(new Set());
    setInvalidCells(null);
    setCascade(null);
  }, []);

  const rejectSwap = useCallback(async (original, attempt, a, b) => {
    setInvalidCells([a, b]);
    setBoard(attempt);
    playInvalid();
    haptic("error");
    await sleep(260);
    setBoard(original);
    setInvalidCells(null);
  }, []);

  const playSteps = useCallback(async (steps) => {
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
  }, []);

  return { board, setBoard, reset, rejectSwap, playSteps, poppingCells, droppingColumns, invalidCells, cascade };
}

/**
 * The 6x6 grid. Swipe a tile into its neighbour, or tap two neighbours; after
 * a quiet spell one legal swap glows. Calls onSwap(a, b) with {row, col} cells.
 */
function Match3Board({ board, locked, finished, syncing, poppingCells, droppingColumns, invalidCells, onSwap }) {
  const [selected, setSelected] = useState(null);
  const [hint, setHint] = useState(null);
  const pointer = useRef(null);

  useEffect(() => {
    setHint(null);
    if (!board || locked) return undefined;
    const timer = setTimeout(() => setHint(findValidMove(board)), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [board, locked, selected]);

  const swap = (a, b) => {
    setSelected(null);
    onSwap(a, b);
  };

  const onPointerDown = (e, row, col) => {
    if (locked) return;
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
    swap({ row: p.row, col: p.col }, target);
  };

  const onPointerUp = () => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || p.swiped || locked) return;
    const clicked = { row: p.row, col: p.col };
    haptic("tap");
    if (!selected) return setSelected(clicked);
    if (selected.row === p.row && selected.col === p.col) return setSelected(null);
    if (!isAdjacent(selected, clicked)) return setSelected(clicked);
    swap(selected, clicked);
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

  return (
    <div
      className={`match3-board${syncing ? " is-syncing" : ""}`}
      aria-disabled={finished}
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
              disabled={locked}
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
  );
}

export default Match3Board;
