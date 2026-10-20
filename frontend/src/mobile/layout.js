// Pure layout/gesture helpers - no React, so they're unit-testable.

export const MIN_TAP = 48; // dp - Android/Material and close to Apple's 44pt

/**
 * Pick the column count that gives the biggest square tiles for `count`
 * tiles in a `width` x `height` box. Works for any orientation, so the same
 * Memory Lock board lays out as 4x4 in portrait and 8x2 in landscape.
 */
export function bestGrid(count, width, height, gap = 8) {
  const candidates = [];
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const size = Math.floor(Math.min((width - gap * (columns - 1)) / columns, (height - gap * (rows - 1)) / rows));
    candidates.push({ columns, rows, size: Math.max(0, size), evenFill: count % columns === 0 });
  }
  const biggest = candidates.reduce((a, b) => (b.size > a.size ? b : a));
  const biggestEven = candidates.filter((c) => c.evenFill).reduce((a, b) => (b.size > a.size ? b : a));
  // A ragged last row looks broken; take full rows unless they cost >15% of card size.
  const pick = biggestEven.size >= biggest.size * 0.85 ? biggestEven : biggest;
  return { columns: pick.columns, rows: pick.rows, size: pick.size };
}

/**
 * Turn a pointer drag into a swipe direction, or null if it's still a tap.
 * Returns {dr, dc} as a row/column step.
 */
export function swipeDirection(dx, dy, threshold = 18) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return { dr: 0, dc: dx > 0 ? 1 : -1 };
  return { dr: dy > 0 ? 1 : -1, dc: 0 };
}

/** Wrap a shift into 0-25 after a drag of `dx` px across cells `cellWidth` wide. */
export function shiftAfterDrag(startShift, dx, cellWidth) {
  const steps = Math.round(-dx / Math.max(cellWidth, 1));
  return (((startShift + steps) % 26) + 26) % 26;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
