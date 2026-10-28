import React, { useState } from "react";
import api, { errorMessage } from "../api";
import { useAuth } from "../AuthContext";
import { Mail } from "../glyphs";
import { haptic } from "../mobile/haptics";

/**
 * "Confirm your email" card for password sign-ups that haven't entered their
 * code yet. Unverified players can play, but stay off the leaderboards.
 * Renders nothing once the account is verified (or for Google / Apple accounts).
 */
function VerifyEmailCard() {
  const { user, updateUser } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  if (!user || user.is_verified !== false) return null;

  const say = (text, bad = false) => {
    setMessage(text);
    setFailed(bad);
  };

  const verify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const { data } = await api.post("/me/verify-email", { code });
      haptic("success");
      updateUser({ is_verified: data.user.is_verified });
    } catch (err) {
      haptic("error");
      say(errorMessage(err, "Couldn't check that code. Try again."), true);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      await api.post("/me/verify-email/resend");
      setCode("");
      say("New code sent. Check your inbox (and spam).");
    } catch (err) {
      say(errorMessage(err, "Couldn't send a new code. Try again."), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="verify-card" onSubmit={verify}>
      <div className="verify-card-head">
        <Mail size={18} aria-hidden="true" />
        <span>Confirm your email</span>
      </div>
      <p className="account-note">
        We sent a 6-digit code to your email. Enter it to appear on the leaderboards.
      </p>
      <div className="answer-actions">
        <input
          className="answer-input verify-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          aria-label="6-digit code"
        />
        <button type="submit" className="submit-btn" disabled={busy || code.length !== 6}>
          Confirm
        </button>
      </div>
      {message && <p className={`account-message${failed ? " invalid" : ""}`} role="status">{message}</p>}
      <button type="button" className="text-link-btn" onClick={resend} disabled={busy}>
        Send a new code
      </button>
    </form>
  );
}

export default VerifyEmailCard;
