import React, { useState, useEffect, useCallback, useRef } from "react";
import { Versus, SignalOff, Rotate } from "../glyphs";
import api from "../api";
import { useOnline, useRefetchOnReturn } from "../mobile/hooks";
import { isOnline } from "../mobile/network";

function Battle() {
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
      if (mounted.current) setError("Couldn't reach Versus.");
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
      <div className="page-header">
        <h1>Versus</h1>
      </div>

      <div className="coming-soon-banner">
        <div className="coming-soon-icon">
          <Versus size={26} aria-hidden="true" />
        </div>
        <div>
          <div className="coming-soon-title">Head-to-head isn't live yet</div>
          <div className="coming-soon-copy">
            We're building real-time 1v1 cipher races. Until then, here's who'd be across the table
            from you right now.
          </div>
        </div>
      </div>

      {!online && !queue && (
        <div className="empty-state offline-state">
          <SignalOff size={22} />
          <div>Versus needs a connection. It'll load as soon as you're back online.</div>
        </div>
      )}
      {online && error && (
        <div className="empty-state offline-state">
          <div>{error}</div>
          <button className="btn-secondary" onClick={load}>
            <Rotate size={16} /> Try again
          </button>
        </div>
      )}
      {online && !queue && !error && <div className="loading-inline">Loading players</div>}

      {queue && queue.length === 0 && (
        <div className="empty-state">Nobody else here yet. Tell a friend.</div>
      )}

      {queue && queue.length > 0 && (
        <div className="battle-queue">
          {queue.map((opponent, i) => (
            <div className="battle-row" key={i}>
              <div className="battle-avatar">{String(opponent.username || "??").slice(0, 2).toUpperCase()}</div>
              <div className="battle-main">
                <div className="battle-username">{opponent.username}</div>
                <div className="battle-meta">
                  Level {opponent.level ?? 1} · {Number(opponent.score || 0).toLocaleString()} pts
                </div>
              </div>
              <button className="challenge-btn" disabled title="Not live yet">
                Soon
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Battle;
