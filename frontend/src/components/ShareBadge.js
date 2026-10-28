import React, { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { Badge } from "../glyphs";
import { haptic } from "../mobile/haptics";
import { PASTE_TARGETS, copyText, openShare, shareText } from "../share";

const TARGETS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Facebook" },
  { id: "email", label: "Email" },
];

/** Leaderboard place if the player is in the top 10, otherwise null. */
function useRank(username) {
  const [rank, setRank] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/leaderboard")
      .then(({ data }) => {
        const row = data.leaderboard?.find((r) => r.username === username);
        if (!cancelled && row) setRank(row.rank);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [username]);
  return rank;
}

/** Share one badge to LinkedIn, WhatsApp, Facebook, email, or copy the text. */
function ShareBadgeDialog({ badge, onClose }) {
  const { user } = useAuth();
  const rank = useRank(user?.username);
  const [note, setNote] = useState("");
  const details = { badge, rank };

  const share = async (target) => {
    haptic("tap");
    if (PASTE_TARGETS.has(target)) {
      const copied = await copyText(shareText(target, details));
      setNote(copied ? "Text copied. Paste it into your post." : "");
    }
    openShare(target, details);
  };

  const copy = async () => {
    const copied = await copyText(shareText("whatsapp", details));
    setNote(copied ? "Copied." : "Couldn't copy on this device.");
    if (copied) haptic("success");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <div className="share-dialog-badge">
          <Badge size={22} aria-hidden="true" />
          <span>{badge}</span>
        </div>
        <h2 id="share-title">Share this badge</h2>
        <div className="share-targets">
          {TARGETS.map((t) => (
            <button key={t.id} type="button" className="btn-secondary" onClick={() => share(t.id)}>
              {t.label}
            </button>
          ))}
          <button type="button" className="btn-secondary" onClick={copy}>
            Copy text
          </button>
        </div>
        <p className="account-note" role="status">
          {note || "WhatsApp Status is in WhatsApp's share list."}
        </p>
        <button type="button" className="hint-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export default ShareBadgeDialog;
