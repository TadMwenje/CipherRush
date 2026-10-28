import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Help, Flame, CheckOct, SignalOff } from "../glyphs";
import api from "../api";
import { useAuth } from "../AuthContext";
import { GAME_MODES, DAILY_MODE } from "../constants/gameModes";
import HowToPlayModal from "../components/HowToPlayModal";
import { haptic } from "../mobile/haptics";
import { isOnline } from "../mobile/network";
import { useOnline, useRefetchOnReturn } from "../mobile/hooks";
import { syncDailyReminders } from "../notifications";
import { ReminderPrompt } from "../components/Reminders";

const VARIANT_LABEL = { caesar: "Caesar", atbash: "Atbash", vigenere: "Vigenère" };

function DailyCard({ daily, onOpen }) {
  const { Icon } = DAILY_MODE;
  let status = "Today's cipher is waiting.";
  if (daily?.round) status = "In progress - the clock's running.";
  else if (daily?.played) status = daily.solved ? `Cracked in ${daily.seconds}s. Back tomorrow.` : "Missed today. Back tomorrow.";
  return (
    <button className={`daily-card${daily?.played ? " done" : ""}`} onClick={onOpen}>
      <div className="daily-card-icon">{daily?.solved ? <CheckOct size={26} /> : <Icon size={26} />}</div>
      <div className="daily-card-body">
        <div className="daily-card-title">
          Daily Cipher {daily && <span className="daily-card-variant">{VARIANT_LABEL[daily.variant]}</span>}
        </div>
        <div className="daily-card-status">{status}</div>
      </div>
      {daily?.streak > 0 && (
        <div className="daily-card-streak" title={`${daily.streak}-day streak`}>
          <Flame size={16} /> {daily.streak}
        </div>
      )}
    </button>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const online = useOnline();

  const load = useCallback(() => {
    let cancelled = false;
    api.get("/me/dashboard").then((res) => !cancelled && setStats(res.data)).catch(() => {});
    api
      .get("/daily")
      .then((res) => {
        if (cancelled) return;
        setDaily(res.data);
        syncDailyReminders(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => (isOnline() ? load() : undefined), [load]);
  useRefetchOnReturn(load);

  const s = stats || user;
  const percent = stats?.level_percent ?? 0;
  const go = (path) => {
    haptic("tap");
    navigate(path);
  };

  return (
    <div className="dashboard page-screen">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">Logged in as</div>
          <h1>{user.username}</h1>
        </div>
        <div className="user-avatar">{(user.username || "??").slice(0, 2).toUpperCase()}</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{s.level ?? 1}</div>
          <div className="stat-label">Level</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{(s.total_score ?? 0).toLocaleString()}</div>
          <div className="stat-label">Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{s.puzzles_completed ?? 0}</div>
          <div className="stat-label">Solved</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{s.badges_count ?? 0}</div>
          <div className="stat-label">Badges</div>
        </div>
      </div>

      <div className="progress-section">
        <div className="level-progress">
          <div className="progress-text">Level {s.level ?? 1}</div>
          <div className="progress-percent">{percent}%</div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="progress-xp">
          {stats && stats.xp_for_next_level > 0
            ? `${Number(stats.xp_into_level || 0).toLocaleString()} / ${stats.xp_for_next_level.toLocaleString()} XP to level ${(s.level ?? 1) + 1}`
            : stats
              ? "Max level. Respect."
              : " "}
        </div>
      </div>

      <DailyCard daily={daily} onOpen={() => go(DAILY_MODE.path)} />
      <ReminderPrompt />
      {!online && (
        <button className="practice-card" onClick={() => go("/practice")}>
          <SignalOff size={20} />
          <span>
            <strong>You're offline.</strong> Scored games need a connection. Practice Mode works without one.
          </span>
        </button>
      )}

      <div className="game-modes-header">
        <h2>Pick a game</h2>
        <button className="howto-link" onClick={() => setShowHowTo(true)}>
          <Help size={18} /> How it works
        </button>
      </div>
      <div className="game-modes">
        {GAME_MODES.map(({ key, path, label, tagline, Icon, css }) => (
          <button key={key} className={`game-mode-btn ${css}`} onClick={() => go(path)}>
            <div className="game-icon">
              <Icon size={24} />
            </div>
            <div className="game-mode-text">
              <div>{label}</div>
              <div className="game-mode-tagline">{tagline}</div>
            </div>
          </button>
        ))}
      </div>
      {online && (
        <button className="practice-link" onClick={() => go("/practice")}>
          Practice Mode: unscored Caesar, Atbash and True/False that work offline
        </button>
      )}
      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
    </div>
  );
}

export default Dashboard;
