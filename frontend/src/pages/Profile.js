import React, { useState, useEffect } from "react";
import { Badge, Circuit } from "../glyphs";
import api from "../api";
import { getGameMode } from "../constants/gameModes";
import AccountSettings from "../components/AccountSettings";

function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await api.get("/me/profile");
        const p = response.data;
        if (typeof p?.username !== "string") throw new Error("Unexpected /me/profile response");
        if (!cancelled) setProfile({ ...p, achievements: p.achievements || [], game_history: p.game_history || [] });
      } catch (err) {
        if (!cancelled) setError(err.response ? "Couldn't load your profile." : "Couldn't load your profile. Check your signal.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-screen profile-page">
      <div className="page-header">
        <h1>Profile</h1>
      </div>

      {error && <p className="error">{error}</p>}
      {!profile && !error && <div className="loading-inline">Loading profile</div>}

      {profile && (
        <>
          <div className="profile-card">
            <div className="profile-avatar">{profile.username.slice(0, 2).toUpperCase()}</div>
            <div className="profile-identity">
              <div className="profile-username">{profile.username}</div>
              <div className="profile-email">{profile.email}</div>
              <div className="profile-since">Member since {formatDate(profile.member_since)}</div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{profile.level}</div>
              <div className="stat-label">Level</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{Number(profile.total_score || 0).toLocaleString()}</div>
              <div className="stat-label">Score</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{profile.puzzles_completed}</div>
              <div className="stat-label">Solved</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{profile.achievements.length}</div>
              <div className="stat-label">Badges</div>
            </div>
          </div>

          <section className="profile-section">
            <h2>Badges</h2>
            {profile.achievements.length === 0 ? (
              <div className="empty-state">None yet. Your first game earns one.</div>
            ) : (
              <div className="achievement-grid">
                {profile.achievements.map((a) => (
                  <div className="achievement-badge" key={a.badge_name}>
                    <div className="achievement-icon">
                      <Badge size={22} aria-hidden="true" />
                    </div>
                    <div className="achievement-name">{a.badge_name}</div>
                    <div className="achievement-desc">{a.description}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profile-section">
            <h2>Recent games</h2>
            {profile.game_history.length === 0 ? (
              <div className="empty-state">Nothing yet. Go play something.</div>
            ) : (
              <div className="history-list">
                {profile.game_history.map((h, i) => {
                  const mode = getGameMode(h.game_type);
                  const Icon = mode ? mode.Icon : Circuit;
                  const label = mode ? mode.label : h.game_type;
                  return (
                    <div className="history-row" key={i}>
                      <div className="history-icon">
                        <Icon size={20} aria-hidden="true" />
                      </div>
                      <div className="history-main">
                        <div className="history-label">{label}</div>
                        <div className="history-meta">
                          Level {h.level} · {formatDate(h.played_at)}
                        </div>
                      </div>
                      <div className="history-score">+{h.score}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <AccountSettings />
        </>
      )}
    </div>
  );
}

export default Profile;
