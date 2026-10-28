import React, { useState, useEffect } from "react";
import { Badge } from "../glyphs";
import { playVictory } from "../sound";
import ShareBadgeDialog from "./ShareBadge";

const DISPLAY_MS = 3200;

// Cycles through newly-unlocked achievements one at a time as a toast card.
function AchievementToast({ achievements, onDone }) {
  const [index, setIndex] = useState(0);
  const [sharing, setSharing] = useState(null);

  useEffect(() => {
    setIndex(0);
    if (achievements && achievements.length > 0) playVictory();
  }, [achievements]);

  useEffect(() => {
    // Hold the toast while its share sheet is open.
    if (!achievements || achievements.length === 0 || sharing) return undefined;
    const timer = setTimeout(() => {
      if (index < achievements.length - 1) {
        setIndex((i) => i + 1);
      } else {
        onDone();
      }
    }, DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [achievements, index, onDone, sharing]);

  if (!achievements || achievements.length === 0) return null;
  const current = achievements[index];

  if (sharing) return <ShareBadgeDialog badge={sharing} onClose={() => setSharing(null)} />;

  return (
    <div className="achievement-toast" role="status" aria-live="polite">
      <div className="achievement-toast-icon">
        <Badge size={22} />
      </div>
      <div className="achievement-toast-body">
        <div className="achievement-toast-label">Badge unlocked</div>
        <div className="achievement-toast-name">{current.badge_name}</div>
        <div className="achievement-toast-desc">{current.description}</div>
      </div>
      <button type="button" className="achievement-share-btn" onClick={() => setSharing(current.badge_name)}>
        Share
      </button>
    </div>
  );
}

export default AchievementToast;
