import React, { useState, useEffect } from "react";
import { Versus } from "../glyphs";
import api from "../api";

function Battle() {
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await api.get("/battle/queue");
        if (!cancelled) setQueue(response.data.queue);
      } catch (err) {
        if (!cancelled) setError("Couldn't load opponents. Pull to retry.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

      {error && <p className="error">{error}</p>}
      {!queue && !error && <div className="loading-inline">Loading players</div>}

      {queue && queue.length === 0 && (
        <div className="empty-state">Nobody else here yet. Tell a friend.</div>
      )}

      {queue && queue.length > 0 && (
        <div className="battle-queue">
          {queue.map((opponent, i) => (
            <div className="battle-row" key={i}>
              <div className="battle-avatar">{opponent.username.slice(0, 2).toUpperCase()}</div>
              <div className="battle-main">
                <div className="battle-username">{opponent.username}</div>
                <div className="battle-meta">
                  Level {opponent.level} · {opponent.score.toLocaleString()} pts
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
