import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Help, Flame, CheckOct, SignalOff } from "../glyphs";
import { useCachedGet } from "../cache";
import { useAuth } from "../AuthContext";
import { GAME_MODES, DAILY_MODE } from "../constants/gameModes";
import HowToPlayModal from "../components/HowToPlayModal";
import GamePreview from "../components/GamePreview";
import { haptic } from "../mobile/haptics";
import { useOnline, useRefetchOnReturn } from "../mobile/hooks";
import { syncDailyReminders } from "../notifications";
import { ReminderPrompt } from "../components/Reminders";
import VerifyEmailCard from "../components/VerifyEmail";
import BoostOffer from "../components/BoostOffer";
import { initAds } from "../ads/admob";
import { shouldOfferBoost } from "../ads/pacing";
import { modeText, useLanguage, useT } from "../i18n";
import { variantLabel } from "../games/cipherText";

function DailyCard({ daily, onOpen }) {
  const t = useT();
  const { Icon } = DAILY_MODE;
  let status = t("daily.waiting");
  if (daily?.round) status = t("daily.inProgress");
  else if (daily?.played) status = daily.solved ? t("daily.cracked", { s: daily.seconds }) : t("daily.missed");
  return (
    <button className={`daily-card${daily?.played ? " done" : ""}`} onClick={onOpen}>
      <div className="daily-card-icon">{daily?.solved ? <CheckOct size={26} /> : <Icon size={26} />}</div>
      <div className="daily-card-body">
        <div className="daily-card-title">
          {t("daily.title")} {daily && <span className="daily-card-variant">{variantLabel(daily.variant, t)}</span>}
        </div>
        <div className="daily-card-status">{status}</div>
      </div>
      {daily?.streak > 0 && (
        <div className="daily-card-streak" title={t("daily.streak", { n: daily.streak })}>
          <Flame size={16} /> {daily.streak}
        </div>
      )}
    </button>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = useLanguage();
  // Cached copies render at once; the server's answer replaces them (cache.js).
  const { data: stats, refresh: refreshStats } = useCachedGet("/me/dashboard", {
    scope: user?.id,
  });
  const { data: daily, stale: dailyStale, refresh: refreshDaily } = useCachedGet("/daily", { scope: user?.id });
  const [showHowTo, setShowHowTo] = useState(false);
  const [howToKey, setHowToKey] = useState(null);
  const [boostFor, setBoostFor] = useState(null);
  const online = useOnline();

  const load = useCallback(() => {
    const stopStats = refreshStats();
    const stopDaily = refreshDaily();
    return () => {
      stopStats();
      stopDaily();
    };
  }, [refreshStats, refreshDaily]);

  // Reminders follow the server's answer, never a cached copy of it.
  useEffect(() => {
    if (daily && !dailyStale) syncDailyReminders(daily);
  }, [daily, dailyStale]);
  useEffect(() => {
    initAds();
  }, []);
  useRefetchOnReturn(load);

  const s = stats || user;
  const percent = stats?.level_percent ?? 0;
  const go = (path) => {
    haptic("tap");
    navigate(path);
  };
  // Now and then, offer double points before a scored game (see ads/pacing.js).
  const play = (mode) => {
    if (online && shouldOfferBoost(mode.key)) {
      haptic("tap");
      setBoostFor(mode);
    } else {
      go(mode.path);
    }
  };

  return (
    <div className="dashboard page-screen">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-kicker">{t("dash.loggedInAs")}</div>
          <h1>{user.username}</h1>
        </div>
        <div className="user-avatar">{(user.username || "??").slice(0, 2).toUpperCase()}</div>
      </div>

      <VerifyEmailCard />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{s.level ?? 1}</div>
          <div className="stat-label">{t("stat.level")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{(s.total_score ?? 0).toLocaleString(lang)}</div>
          <div className="stat-label">{t("stat.score")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{s.puzzles_completed ?? 0}</div>
          <div className="stat-label">{t("stat.solved")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{s.badges_count ?? 0}</div>
          <div className="stat-label">{t("stat.badges")}</div>
        </div>
      </div>

      <div className="progress-section">
        <div className="level-progress">
          <div className="progress-text">{t("dash.level", { n: s.level ?? 1 })}</div>
          <div className="progress-percent">{percent}%</div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="progress-xp">
          {stats && stats.xp_for_next_level > 0
            ? t("dash.xpToNext", {
                have: Number(stats.xp_into_level || 0).toLocaleString(lang),
                need: stats.xp_for_next_level.toLocaleString(lang),
                next: (s.level ?? 1) + 1,
              })
            : stats
              ? t("dash.maxLevel")
              : " "}
        </div>
      </div>

      <DailyCard daily={daily} onOpen={() => go(DAILY_MODE.path)} />
      <ReminderPrompt />
      {!online && (
        <button className="practice-card" onClick={() => go("/practice")}>
          <SignalOff size={20} />
          <span>
            <strong>{t("dash.offlineTitle")}</strong> {t("dash.offlineBody")}
          </span>
        </button>
      )}

      <div className="game-modes-header">
        <h2>{t("dash.pickGame")}</h2>
        <button className="howto-link" onClick={() => setShowHowTo(true)}>
          <Help size={18} /> {t("dash.howItWorks")}
        </button>
      </div>
      <div className="game-modes">
        {GAME_MODES.map((mode) => {
          const { key, path, Icon, css } = mode;
          const { label, tagline } = modeText(mode, lang);
          return (
            // Two sibling buttons, not nested: the card plays, the "?" explains.
            <div key={key} className={`game-card ${css}`}>
              <button className={`game-mode-btn game-card-main ${css}`} onClick={() => play({ key, path, label })}>
                <GamePreview mode={key} />
                <div className="game-mode-text">
                  <div className="game-card-title">
                    <span className="game-icon">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    {label}
                  </div>
                  <div className="game-mode-tagline">{tagline}</div>
                </div>
              </button>
              <button
                className="game-card-help"
                onClick={() => {
                  haptic("tap");
                  setHowToKey(key);
                }}
                aria-label={t("dash.howToPlay", { mode: label })}
              >
                <Help size={18} />
              </button>
            </div>
          );
        })}
      </div>
      {online && (
        <button className="practice-link" onClick={() => go("/practice")}>
          {t("dash.practiceLink")}
        </button>
      )}
      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}
      {howToKey && <HowToPlayModal focusKey={howToKey} onClose={() => setHowToKey(null)} />}
      {boostFor && (
        <BoostOffer
          label={boostFor.label}
          onDone={() => {
            setBoostFor(null);
            navigate(boostFor.path);
          }}
        />
      )}
    </div>
  );
}

export default Dashboard;
