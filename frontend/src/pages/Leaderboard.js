import React from "react";
import { useSearchParams } from "react-router-dom";
import { Medal, Badge, Bolt, Calendar, SignalOff, Rotate } from "../glyphs";
import { useCachedGet } from "../cache";
import { useAuth } from "../AuthContext";
import { haptic } from "../mobile/haptics";
import { useOnline, useRefetchOnReturn } from "../mobile/hooks";
import { useLanguage, useT } from "../i18n";

const MEDAL_CLASSES = ["gold", "silver", "bronze"];

const BOARDS = {
  overall: { label: "ranks.allTime", path: "/leaderboard", subtitle: "ranks.allTimeSub" },
  rush: { label: "ranks.rush", path: "/leaderboard/rush", subtitle: "ranks.rushSub", Icon: Bolt },
  daily: {
    label: "ranks.today",
    path: "/leaderboard/daily",
    subtitle: "ranks.todaySub",
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
  return `Level ${entry.level ?? 1} · ${entry.games_played ?? 0} games`;
}

function entryValue(board, entry, lang) {
  if (board === "daily") return formatSeconds(entry.seconds);
  return Number((board === "rush" ? entry.best_score : entry.score) || 0).toLocaleString(lang);
}

function Leaderboard() {
  const { user } = useAuth();
  const t = useT();
  const lang = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const board = BOARDS[searchParams.get("board")] ? searchParams.get("board") : "overall";
  const online = useOnline();

  const setBoard = (key) => {
    haptic("select");
    setSearchParams(key === "overall" ? {} : { board: key }, { replace: true });
  };

  // Live service, shown from the last cached copy while it refreshes
  // (cache.js). Fetched when a board opens and when the player returns to it.
  // No polling, and nothing at all while offline.
  const { data, error: loadError, refresh } = useCachedGet(BOARDS[board].path, {
    accept: (d) => Array.isArray(d?.leaderboard),
  });
  const entries = data?.leaderboard ?? null;
  const error = loadError && !entries ? t("ranks.loadError") : "";
  const load = refresh;
  useRefetchOnReturn(() => load());

  return (
    <div className="page-screen leaderboard-page">
      <div className="page-header">
        <h1>{t("ranks.title")}</h1>
        <p className="page-subtitle">{t(BOARDS[board].subtitle)}</p>
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
            {Icon && <Icon size={16} />} {t(label)}
          </button>
        ))}
      </div>

      {!online && !entries && (
        <div className="empty-state offline-state">
          <SignalOff size={22} />
          <div>{t("ranks.offline")}</div>
        </div>
      )}
      {online && error && (
        <div className="empty-state offline-state">
          <div>{error}</div>
          <button className="btn-secondary" onClick={() => load()}>
            <Rotate size={16} /> {t("ranks.tryAgain")}
          </button>
        </div>
      )}
      {online && !entries && !error && <div className="loading-inline">{t("ranks.loading")}</div>}
      {entries && entries.length === 0 && (
        <div className="empty-state">{t("ranks.empty")}</div>
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
                    {isYou && <span className="lb-you-tag">{t("ranks.you")}</span>}
                  </div>
                  <div className="lb-meta">{entryMeta(board, entry)}</div>
                </div>
                <div className="lb-side">
                  <div className="lb-score">{entryValue(board, entry, lang)}</div>
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
