import React, { useEffect, useState } from "react";
import api, { errorMessage } from "../api";
import { useAuth } from "../AuthContext";
import { LegalLinks, ExternalLink } from "./LegalLinks";
import { LEGAL_URLS } from "../legal";
import { haptic } from "../mobile/haptics";
import { ReminderSettings } from "./Reminders";

const PROVIDER_LABEL = { google: "Google", apple: "Apple" };

function DeleteAccountDialog({ onClose, onDeleted }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/me/delete", { confirm: "DELETE" });
      haptic("success");
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete the account. Try again."));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal danger-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="delete-title">Delete your account?</h2>
        <p>
          This permanently removes your account, scores, levels, badges and leaderboard places. It can't be undone.
          If you signed in with Apple, we'll also revoke CipherRush's access to your Apple ID.
        </p>
        <p className="legal-consent">
          Details: <ExternalLink href={LEGAL_URLS.accountDeletion}>what gets deleted</ExternalLink>
        </p>
        <form onSubmit={remove} className="answer-section">
          <label htmlFor="delete-confirm" className="danger-label">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm"
            className="answer-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {error && <p className="error">{error}</p>}
          <div className="answer-actions">
            <button type="button" className="hint-btn" onClick={onClose} disabled={busy}>
              Keep it
            </button>
            <button type="submit" className="danger-btn" disabled={busy || confirm.trim().toUpperCase() !== "DELETE"}>
              {busy ? "Deleting" : "Delete forever"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Profile → Account: handle, sign-in methods, legal links, log out, delete. */
function AccountSettings() {
  const { logout, updateUser, clearSession } = useAuth();
  const [account, setAccount] = useState(null);
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    api
      .get("/me/account")
      .then((res) => {
        setAccount(res.data);
        setHandle(res.data.username);
      })
      .catch(() => {});
  }, []);

  const saveHandle = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const { data } = await api.post("/me/username", { username: handle });
      updateUser({ username: data.user.username });
      setAccount((a) => ({ ...a, username: data.user.username }));
      setMessage("Handle updated.");
      haptic("success");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const methods = account
    ? [...(account.has_password ? ["Password"] : []), ...account.providers.map((p) => PROVIDER_LABEL[p] || p)]
    : [];

  return (
    <section className="profile-section account-settings">
      <h2>Account</h2>

      {account && (
        <form className="account-row" onSubmit={saveHandle}>
          <label htmlFor="handle-input">Handle (shown on leaderboards)</label>
          <div className="answer-actions">
            <input
              id="handle-input"
              className="answer-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={20}
            />
            <button type="submit" className="submit-btn" disabled={saving || handle.trim() === account.username}>
              Save
            </button>
          </div>
          {message && <p className="account-message">{message}</p>}
        </form>
      )}

      {account && (
        <div className="account-row">
          <span className="account-label">Signs in with</span>
          <span>{methods.join(" · ") || "—"}</span>
          {account.email && <span className="account-email">{account.email}</span>}
        </div>
      )}

      <ReminderSettings />

      <div className="account-row">
        <span className="account-label">Legal</span>
        <LegalLinks />
        <span className="account-note">CipherRush is made and run by AximoIX.</span>
      </div>

      <button className="btn-secondary logout-btn" onClick={logout}>
        Log out
      </button>
      <button className="danger-link" onClick={() => setShowDelete(true)}>
        Delete account
      </button>

      {showDelete && <DeleteAccountDialog onClose={() => setShowDelete(false)} onDeleted={clearSession} />}
    </section>
  );
}

export default AccountSettings;
