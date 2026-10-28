import { seededRng } from "./engine";
import { findMatches, findValidMove, generateBoard, resolveSwap, swapped, taperedMultiplier, SIZE, SYMBOLS } from "./match3";

test("fresh boards have no matches on them and at least one legal move", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const board = generateBoard(seededRng(seed));
    expect(board).toHaveLength(SIZE);
    board.forEach((row) => row.forEach((s) => expect(SYMBOLS).toContain(s)));
    expect(findMatches(board).size).toBe(0);
    expect(findValidMove(board)).not.toBeNull();
  }
});

test("a legal swap scores its tiles, refills the board and leaves it playable", () => {
  const rng = seededRng(7);
  const board = generateBoard(rng);
  const [a, b] = findValidMove(board);
  const res = resolveSwap(board, a, b, rng);
  expect(res.steps.length).toBeGreaterThan(0);
  expect(res.steps[0].gained).toBe(res.steps[0].matched.length * 5);
  expect(res.gained).toBe(res.steps.reduce((sum, s) => sum + s.gained, 0));
  expect(findMatches(res.board).size).toBe(0);
  expect(findValidMove(res.board)).not.toBeNull();
});

test("matches are found in rows and columns, and only runs of three or more", () => {
  const board = [
    ["lock", "lock", "lock", "key"],
    ["key", "shield", "siren", "key"],
    ["siren", "key", "shield", "key"],
    ["shield", "siren", "key", "lock"],
  ];
  expect([...findMatches(board)].sort()).toEqual(["0,0", "0,1", "0,2", "0,3", "1,3", "2,3"].sort());
  expect(findMatches(swapped(board, { row: 0, col: 2 }, { row: 1, col: 2 })).has("0,2")).toBe(false);
});

test("cascade multiplier follows the server's tapered curve", () => {
  expect(taperedMultiplier(1)).toBe(1);
  expect(taperedMultiplier(2)).toBe(1.5);
  expect(taperedMultiplier(30)).toBeLessThanOrEqual(2.5);
});
