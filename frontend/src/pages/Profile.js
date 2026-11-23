import React, { useState } from "react";
import { Badge, Circuit } from "../glyphs";
import { useCachedGet } from "../cache";
import { useAuth } from "../AuthContext";
import { getGameMode } from "../constants/gameModes";
import AccountSettings, { HandleForm, useAccount } from "../components/AccountSettings";
import ShareBadgeDialog from "../components/ShareBadge";
import Preferences from "../components/Preferences";
import { formatDate, formatNumber, modeText, useLanguage, useT } from "../i18n";

function Profile() {
  const { user } = useAuth();
  const t = useT();
  const lang = useLanguage();
  const [sharing, setSharing] = useState(null);
  const [account, setAccount] = useAccount();
  // Last copy first, then the server's (cache.js).
  const { data, error: loadError } = useCachedGet("/me/profile", {
    scope: user?.id,
    accept: (p) => typeof p?.username === "string",
  });
  const profile = data
    ? { ...data, achievements: data.achievements || [], game_history: data.game_history || [] }
    : null;
  const error =
    loadError && !profile ? (loadError.response ? t("profile.loadError") : t("profile.loadErrorSignal")) : "";

  return (
    <div className="page-screen profile-page">
      <div className="page-header">
        <h1>{t("profile.title")}</h1>
      </div>

      {error && <p className="error">{error}</p>}
      {!profile && !error && <div className="loading-inline">{t("profile.loading")}</div>}

      {profile && (
        <>
          {/* 1. Identity: who you are, your handle, where you stand. */}
          <section className="profile-identity-card" aria-label={t("profile.title")}>
            <div className="profile-card">
              <div className="profile-avatar">{profile.username.slice(0, 2).toUpperCase()}</div>
              <div className="profile-identity">
                <div className="profile-username">{account?.username || profile.username}</div>
                <div className="profile-email">{profile.email}</div>
                <div className="profile-since">
                  {t("profile.memberSince", { date: formatDate(profile.member_since, lang) })}
                </div>
              </div>
            </div>
            <HandleForm account={account} setAccount={setAccount} />

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-number">{profile.level}</div>
                <div className="stat-label">{t("stat.level")}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{formatNumber(profile.total_score, lang)}</div>
                <div className="stat-label">{t("stat.score")}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{profile.puzzles_completed}</div>
                <div className="stat-label">{t("stat.solved")}</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{profile.achievements.length}</div>
                <div className="stat-label">{t("stat.badges")}</div>
              </div>
            </div>
          </section>

          <section className="profile-section">
            <h2>{t("profile.badges")}</h2>
            {profile.achievements.length === 0 ? (
              <div className="empty-state">{t("profile.noBadges")}</div>
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
                      {t("profile.share")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profile-section">
            <h2>{t("profile.recentGames")}</h2>
            {profile.game_history.length === 0 ? (
              <div className="empty-state">{t("profile.noGames")}</div>
            ) : (
              <div className="history-list">
                {profile.game_history.map((h, i) => {
                  const mode = getGameMode(h.game_type);
                  const Icon = mode ? mode.Icon : Circuit;
                  const label = mode ? modeText(mode, lang).label : h.game_type;
                  return (
                    <div className="history-row" key={i}>
                      <div className="history-icon">
                        <Icon size={20} aria-hidden="true" />
                      </div>
                      <div className="history-main">
                        <div className="history-label">{label}</div>
                        <div className="history-meta">
                          {t("profile.historyMeta", { n: h.level, date: formatDate(h.played_at, lang) })}
                        </div>
                      </div>
                      <div className="history-score">+{h.score}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {sharing && <ShareBadgeDialog badge={sharing} onClose={() => setSharing(null)} />}
        </>
      )}

      {/* 2. Preferences: on this device, so they work offline before anything loads. */}
      <Preferences signedIn={Boolean(user)} />

      {/* 3. Account and data, then 4. the danger zone, always last. */}
      {user && <AccountSettings account={account} setAccount={setAccount} />}
    </div>
  );
}

export default Profile;
