import { bestGrid, swipeDirection, shiftAfterDrag, formatClock, MIN_TAP } from "./layout";
import { keyboardInset, needsReveal } from "./keyboard";

describe("bestGrid", () => {
  test("portrait phone lays 16 cards out 4x4", () => {
    expect(bestGrid(16, 328, 460)).toMatchObject({ columns: 4, rows: 4 });
  });

  test("a short, wide landscape stage lays 16 cards out wide, not 4x4", () => {
    const grid = bestGrid(16, 760, 300);
    expect(grid.columns).toBeGreaterThanOrEqual(8);
    expect(grid.rows).toBeLessThanOrEqual(2);
  });

  test("cards stay at least 48dp on a small phone at every board size", () => {
    for (const count of [8, 12, 16, 20, 24]) {
      expect(bestGrid(count, 328, 470).size).toBeGreaterThanOrEqual(MIN_TAP);
      expect(bestGrid(count, 540, 330).size).toBeGreaterThanOrEqual(MIN_TAP);
    }
  });

  test("never leaves a whole empty row", () => {
    for (const count of [8, 12, 16, 20, 24]) {
      const { columns, rows } = bestGrid(count, 400, 400);
      expect(rows * columns - count).toBeLessThan(columns);
    }
  });
});

describe("swipeDirection", () => {
  test("small movement is still a tap", () => {
    expect(swipeDirection(5, -6)).toBeNull();
  });
  test("dominant axis wins", () => {
    expect(swipeDirection(40, 10)).toEqual({ dr: 0, dc: 1 });
    expect(swipeDirection(-40, 10)).toEqual({ dr: 0, dc: -1 });
    expect(swipeDirection(8, 30)).toEqual({ dr: 1, dc: 0 });
    expect(swipeDirection(8, -30)).toEqual({ dr: -1, dc: 0 });
  });
});

describe("shiftAfterDrag", () => {
  test("dragging left by one cell advances the shift", () => {
    expect(shiftAfterDrag(3, -24, 24)).toBe(4);
  });
  test("wraps around the alphabet both ways", () => {
    expect(shiftAfterDrag(25, -24, 24)).toBe(0);
    expect(shiftAfterDrag(0, 24, 24)).toBe(25);
  });
});

test("formatClock", () => {
  expect(formatClock(0)).toBe("00:00");
  expect(formatClock(119.2)).toBe("02:00");
  expect(formatClock(65)).toBe("01:05");
});

describe("keyboard", () => {
  test("iOS-style keyboard: layout height unchanged, visual viewport shrinks", () => {
    expect(keyboardInset(844, 508, 0)).toBe(336);
  });
  test("Android with resizes-content: both shrink, no inset", () => {
    expect(keyboardInset(508, 508, 0)).toBe(0);
  });
  test("a field behind the keyboard needs revealing; one in view doesn't", () => {
    expect(needsReveal({ top: 600, bottom: 652 }, 508)).toBe(true);
    expect(needsReveal({ top: 300, bottom: 352 }, 508)).toBe(false);
    expect(needsReveal({ top: -20, bottom: 32 }, 508)).toBe(true);
  });
});
