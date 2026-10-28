import React, { useState } from "react";
import { Bolt } from "../glyphs";
import { errorMessage } from "../api";
import { haptic } from "../mobile/haptics";
import { earnReward } from "../ads/rewards";

// Opt-in double points (a rewarded interstitial), offered now and then as a
// scored game starts. Whatever happens, the player goes on to their game.
function BoostOffer({ label, onDone }) {
  const [watching, setWatching] = useState(false);
  const [note, setNote] = useState("");

  const watch = async () => {
    setWatching(true);
    setNote("");
    try {
      await earnReward("boost");
      haptic("success");
      onDone();
    } catch (err) {
      setWatching(false);
      setNote(
        err.response?.status === 429
          ? "That's today's three double-point rounds. Back tomorrow."
          : errorMessage(err, err.message),
      );
    }
  };

  return (
    <div className="modal-overlay" onClick={watching ? undefined : onDone}>
      <div
        className="auth-modal boost-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boost-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-dialog-badge">
          <Bolt size={22} aria-hidden="true" />
          <span>Double points</span>
        </div>
        <h2 id="boost-title">Double your next {label} round?</h2>
        <p className="account-note">
          Watch a short ad and the points from your next round count twice. Up to three a day.
        </p>
        {note && (
          <p className="account-note" role="status">
            {note}
          </p>
        )}
        <div className="share-targets">
          <button type="button" className="btn-primary" onClick={watch} disabled={watching}>
            {watching ? "Loading the ad" : "Watch ad"}
          </button>
          <button type="button" className="btn-secondary" onClick={onDone} disabled={watching}>
            {note ? "Play without it" : "No thanks"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BoostOffer;
