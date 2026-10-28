/*
 * Offline Practice Match-3: the same rules as the server's engine
 * (backend/match3_engine.py) - runs of 3+, cascades with a tapered multiplier,
 * a reshuffle when the board goes dead - played entirely on the phone from a
 * local seed. Unscored: nothing here is ever sent to the API.
 */
export const SIZE = 6;
export const SYMBOLS = ["lock", "shield", "key", "siren"]; // level-1 variety
export const TARGET = 220;
export const MOVES = 22;

const POINTS_PER_TILE = 5;
const CASCADE_FIRST_STEP = 0.5;
const CASCADE_CEILING = 2.5;
const MAX_CASCADES = 25;
const MAX_GENERATION_ATTEMPTS = 500;

/** Same curve as economy.tapered_multiplier. */
export function taperedMultiplier(streak, firstStep = CASCADE_FIRST_STEP, ceiling = CASCADE_CEILING) {
  if (streak <= 1) return 1;
  const ratio = 1 - firstStep / (ceiling - 1);
  return Math.round((1 + (ceiling - 1) * (1 - ratio ** (streak - 1))) * 100) / 100;
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function swapped(board, a, b) {
  const next = board.map((row) => [...row]);
  [next[a.row][a.col], next[b.row][b.col]] = [next[b.row][b.col], next[a.row][a.col]];
  return next;
}

/** Every cell that is part of a horizontal or vertical run of 3+, as "r,c". */
export function findMatches(board) {
  const size = board.length;
  const matched = new Set();
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c <= size; c++) {
      if (c < size && board[r][c] === board[r][c - 1]) run += 1;
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) matched.add(`${r},${k}`);
        run = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r <= size; r++) {
      if (r < size && board[r][c] === board[r - 1][c]) run += 1;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) matched.add(`${k},${c}`);
        run = 1;
      }
    }
  }
  return matched;
}

export function findValidMove(board) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const b = { row: r + dr, col: c + dc };
        if (b.row < size && b.col < size && findMatches(swapped(board, { row: r, col: c }, b)).size) {
          return [{ row: r, col: c }, b];
        }
      }
    }
  }
  return null;
}

/** A board with no matches on it and a legal move. Never loops unbounded. */
export function generateBoard(rng, size = SIZE, symbols = SYMBOLS) {
  let best = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const board = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const forbidden = new Set();
        if (c >= 2 && row[c - 1] === row[c - 2]) forbidden.add(row[c - 1]);
        if (r >= 2 && board[r - 1][c] === board[r - 2][c]) forbidden.add(board[r - 1][c]);
        const allowed = symbols.filter((s) => !forbidden.has(s));
        row.push(pick(rng, allowed.length ? allowed : symbols));
      }
      board.push(row);
    }
    if (!findMatches(board).size) {
      best = board;
      if (findValidMove(board)) return board;
    }
  }
  return best || Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => symbols[(r + 2 * c) % symbols.length]));
}

/**
 * Apply a legal swap and resolve every cascade. Same shape as the server's
 * swap response, so the board animates the same way:
 * { steps: [{ matched: [[r, c]...], board, drops, cascade, multiplier, gained }], board, gained, reshuffled }
 */
export function resolveSwap(board, a, b, rng, symbols = SYMBOLS) {
  const size = board.length;
  let current = swapped(board, a, b);
  const steps = [];
  let total = 0;
  let cascade = 1;
  let capped = false;
  for (;;) {
    const matched = findMatches(current);
    if (!matched.size) break;
    if (cascade > MAX_CASCADES) {
      capped = true;
      break;
    }
    const multiplier = taperedMultiplier(cascade);
    const gained = Math.round(matched.size * POINTS_PER_TILE * multiplier);
    total += gained;
    const drops = Array(size).fill(0);
    const next = current.map((row) => [...row]);
    for (let c = 0; c < size; c++) {
      const surviving = [];
      for (let r = 0; r < size; r++) if (!matched.has(`${r},${c}`)) surviving.push(current[r][c]);
      const missing = size - surviving.length;
      drops[c] = missing;
      const column = [...Array.from({ length: missing }, () => pick(rng, symbols)), ...surviving];
      for (let r = 0; r < size; r++) next[r][c] = column[r];
    }
    current = next;
    steps.push({
      matched: [...matched].map((key) => key.split(",").map(Number)),
      board: current.map((row) => [...row]),
      drops,
      cascade,
      multiplier,
      gained,
    });
    cascade += 1;
  }
  let reshuffled = false;
  if (capped || !findValidMove(current)) {
    current = generateBoard(rng, size, symbols);
    reshuffled = true;
  }
  return { steps, board: current, gained: total, reshuffled };
}
