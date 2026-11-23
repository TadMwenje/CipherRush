import React, { useState, useEffect, useCallback, useRef } from "react";
import { Versus, SignalOff, Rotate } from "../glyphs";
import api from "../api";
import { useOnline, useRefetchOnReturn } from "../mobile/hooks";
import { isOnline } from "../mobile/network";
import { formatNumber, useLanguage, useT } from "../i18n";
import AudioControl from "../components/AudioControl";
import useGameMusic from "../hooks/useGameMusic";

function Battle() {
  useGameMusic("versus");
  const t = useT();
  const lang = useLanguage();
  const online = useOnline();
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  // Live service: fetched once when the screen opens, again only when the
  // player comes back to it. No polling, and nothing at all while offline.
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api.get("/battle/queue");
      const list = response.data?.queue;
      if (!mounted.current) return;
      if (!Array.isArray(list)) throw new Error("Unexpected /battle/queue response");
      setQueue(list);
    } catch (err) {
      if (mounted.current) setError("unreachable");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (isOnline()) load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  useRefetchOnReturn(load);

  return (
    <div className="page-screen battle-page">
      <div className="page-header page-header-row">
        <h1>{t("nav.versus")}</h1>
        <AudioControl />
      </div>

      <div className="coming-soon-banner">
        <div className="coming-soon-icon">
          <Versus size={26} aria-hidden="true" />
        </div>
        <div>
          <div className="coming-soon-title">{t("vs.soonTitle")}</div>
          <div className="coming-soon-copy">{t("vs.soonBody")}</div>
        </div>
      </div>

      {!online && !queue && (
        <div className="empty-state offline-state">
          <SignalOff size={22} />
          <div>{t("vs.offline")}</div>
        </div>
      )}
      {online && error && (
        <div className="empty-state offline-state">
          <div>{t("vs.error")}</div>
          <button className="btn-secondary" onClick={load}>
            <Rotate size={16} /> {t("ranks.tryAgain")}
          </button>
        </div>
      )}
      {online && !queue && !error && <div className="loading-inline">{t("vs.loading")}</div>}

      {queue && queue.length === 0 && <div className="empty-state">{t("vs.empty")}</div>}

      {queue && queue.length > 0 && (
        <div className="battle-queue">
          {queue.map((opponent, i) => (
            <div className="battle-row" key={i}>
              <div className="battle-avatar">
                {String(opponent.username || "??")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="battle-main">
                <div className="battle-username">{opponent.username}</div>
                <div className="battle-meta">
                  {t("vs.meta", { n: opponent.level ?? 1, pts: formatNumber(opponent.score, lang) })}
                </div>
              </div>
              <button className="challenge-btn" disabled title={t("vs.notLive")}>
                {t("vs.soon")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Battle;
