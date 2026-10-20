import React, { useEffect } from "react";
import { Trend } from "../glyphs";
import { playVictory } from "../sound";

const DISPLAY_MS = 2800;

// Shows one or more "level up" lines (account level, game level, or both at
// once) as a single toast that auto-dismisses.
function LevelUpToast({ items, onDone }) {
  useEffect(() => {
    if (!items || items.length === 0) return undefined;
    playVictory();
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [items, onDone]);

  if (!items || items.length === 0) return null;

  return (
    <div className="levelup-toast" role="status" aria-live="polite">
      <div className="levelup-toast-icon">
        <Trend size={20} />
      </div>
      <div className="levelup-toast-body">
        {items.map((line, i) => (
          <div className="levelup-toast-line" key={i}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default LevelUpToast;
