import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Medal, Badge, Bolt, Calendar } from "../glyphs";
import api from "../api";
import { useAuth } from "../AuthContext";
import { haptic } from "../mobile/haptics";

const MEDAL_CLASSES = ["gold", "silver", "bronze"];

const BOARDS = {
  overall: { label: "All-time", path: "/leaderboard", subtitle: "Top 10 by total score." },
  rush: { label: "Rush", path: "/leaderboard/rush", subtitle: "Best single 90-second run.", Icon: Bolt },
  daily: {
    label: "Today",
    path: "/leaderboard/daily",
    subtitle: "Fastest Daily Cipher solves. Resets at midnight UTC.",
    Icon: Calendar,
  },
};

function formatSeconds(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function RankCell({ rank }) {
  return (
    <div className="lb-rank">
      {rank <= 3 ? (
        <Medal className={`lb-medal ${MEDAL_CLASSES[rank - 1]}`} size={26} title={`Rank ${rank}`} />
      ) : (
        `#${rank}`
      )}
    </div>
  );
}

function entryMeta(board, entry) {
  if (board === "rush") return `${entry.runs} run${entry.runs === 1 ? "" : "s"}`;
  if (board === "daily") return `+${entry.score} pts`;
  return `Level ${entry.level} · ${entry.games_played} games`;
}

function entryValue(board, entry) {
  if (board === "daily") return formatSeconds(entry.seconds);
  return (board === "rush" ? entry.best_score : entry.score).toLocaleString();
}

function Leaderboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const board = BOARDS[searchParams.get("board")] ? searchParams.get("board") : "overall";
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");

  const setBoard = (key) => {
    haptic("select");
    setSearchParams(key === "overall" ? {} : { board: key }, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError("");
    api
      .get(BOARDS[board].path)
      .then((res) => !cancelled && setEntries(res.data.leaderboard))
      .catch(() => !cancelled && setError("Couldn't load the board."));
    return () => {
      cancelled = true;
    };
  }, [board]);

  return (
    <div className="page-screen leaderboard-page">
      <div className="page-header">
        <h1>Ranks</h1>
        <p className="page-subtitle">{BOARDS[board].subtitle}</p>
      </div>

      <div className="segmented" role="tablist">
        {Object.entries(BOARDS).map(([key, { label, Icon }]) => (
          <button
            key={key}
            role="tab"
            aria-selected={board === key}
            className={`segmented-btn${board === key ? " active" : ""}`}
            onClick={() => setBoard(key)}
          >
            {Icon && <Icon size={16} />} {label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!entries && !error && <div className="loading-inline">Loading ranks</div>}
      {entries && entries.length === 0 && (
        <div className="empty-state">Empty. First one on here gets bragging rights.</div>
      )}

      {entries && entries.length > 0 && (
        <div className="leaderboard-list">
          {entries.map((entry) => {
            const isYou = entry.username === user?.username;
            return (
              <div key={entry.rank} className={`leaderboard-row${isYou ? " is-you" : ""}`}>
                <RankCell rank={entry.rank} />
                <div className="lb-main">
                  <div className="lb-username">
                    {entry.username}
                    {isYou && <span className="lb-you-tag">You</span>}
                  </div>
                  <div className="lb-meta">{entryMeta(board, entry)}</div>
                </div>
                <div className="lb-side">
                  <div className="lb-score">{entryValue(board, entry)}</div>
                  {board === "overall" && (
                    <div className="lb-achievement-badge" title={`${entry.achievements_count} badges`}>
                      <Badge size={14} />
                      {entry.achievements_count}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Leaderboard;
