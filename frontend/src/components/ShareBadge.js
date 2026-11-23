import React, { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { Badge } from "../glyphs";
import { haptic } from "../mobile/haptics";
import { PASTE_TARGETS, copyText, openShare, shareText } from "../share";
import { useT } from "../i18n";

const TARGETS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Facebook" },
  { id: "email", labelKey: "share.email" },
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
  const t = useT();
  const { user } = useAuth();
  const rank = useRank(user?.username);
  const [note, setNote] = useState("");
  const details = { badge, rank };

  const share = async (target) => {
    haptic("tap");
    if (PASTE_TARGETS.has(target)) {
      const copied = await copyText(shareText(target, details));
      setNote(copied ? t("share.copiedPaste") : "");
    }
    openShare(target, details);
  };

  const copy = async () => {
    const copied = await copyText(shareText("whatsapp", details));
    setNote(copied ? t("share.copied") : t("share.copyFail"));
    if (copied) haptic("success");
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
        <div className="share-dialog-badge">
          <Badge size={22} aria-hidden="true" />
          <span>{badge}</span>
        </div>
        <h2 id="share-title">{t("share.title")}</h2>
        <div className="share-targets">
          {TARGETS.map((target) => (
            <button key={target.id} type="button" className="btn-secondary" onClick={() => share(target.id)}>
              {target.labelKey ? t(target.labelKey) : target.label}
            </button>
          ))}
          <button type="button" className="btn-secondary" onClick={copy}>
            {t("share.copyText")}
          </button>
        </div>
        <p className="account-note" role="status">
          {note || t("share.whatsapp")}
        </p>
        <button type="button" className="hint-btn" onClick={onClose}>
          {t("share.done")}
        </button>
      </div>
    </div>
  );
}

export default ShareBadgeDialog;
