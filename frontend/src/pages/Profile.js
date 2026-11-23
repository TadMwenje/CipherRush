import React, { useState } from "react";
import { Badge, Circuit } from "../glyphs";
import { useCachedGet } from "../cache";
import { useAuth } from "../AuthContext";
import { getGameMode } from "../constants/gameModes";
import AccountSettings from "../components/AccountSettings";
import ShareBadgeDialog from "../components/ShareBadge";

function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Profile() {
  const { user } = useAuth();
  const [sharing, setSharing] = useState(null);
  // Last copy first, then the server's (cache.js).
  const { data, error: loadError } = useCachedGet("/me/profile", {
    scope: user?.id,
    accept: (p) => typeof p?.username === "string",
  });
  const profile = data ? { ...data, achievements: data.achievements || [], game_history: data.game_history || [] } : null;
  const error =
    loadError && !profile
      ? loadError.response
        ? "Couldn't load your profile."
        : "Couldn't load your profile. Check your signal."
      : "";

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
                    <button type="button" className="achievement-share-btn" onClick={() => setSharing(a.badge_name)}>
                      Share
                    </button>
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
          {sharing && <ShareBadgeDialog badge={sharing} onClose={() => setSharing(null)} />}
        </>
      )}
    </div>
  );
}

export default Profile;
