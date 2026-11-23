import React, { useEffect, useState } from "react";
import api, { errorMessage } from "../api";
import { useAuth } from "../AuthContext";
import { LegalLinks, ExternalLink, DataNotice } from "./LegalLinks";
import { handleProblemKey } from "../moderation/handle";
import { LEGAL_URLS } from "../legal";
import { haptic } from "../mobile/haptics";
import { clearCache } from "../cache";
import { useT } from "../i18n";
import VerifyEmailCard from "./VerifyEmail";
import { privacyOptionsRequired, showPrivacyOptions } from "../ads/admob";

const PROVIDER_LABEL = { google: "Google", apple: "Apple" };

// Where the law asks for ad consent (EEA, UK, Switzerland), a way to change it.
function AdPrivacyButton() {
  const t = useT();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let cancelled = false;
    privacyOptionsRequired().then((required) => !cancelled && setShown(required));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!shown) return null;
  return (
    <button type="button" className="btn-secondary" onClick={() => showPrivacyOptions().catch(() => {})}>
      {t("acc.adPrivacy")}
    </button>
  );
}

function DeleteAccountDialog({ onClose, onDeleted }) {
  const t = useT();
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
      setError(errorMessage(err, t("acc.delFail")));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="auth-modal danger-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-title">{t("acc.delTitle")}</h2>
        <p>
          {t("acc.delBody")} {t("acc.delApple")}
        </p>
        <p className="legal-consent">
          {t("acc.delDetails")} <ExternalLink href={LEGAL_URLS.accountDeletion}>{t("acc.delWhat")}</ExternalLink>
        </p>
        <form onSubmit={remove} className="answer-section">
          <label htmlFor="delete-confirm" className="danger-label">
            {t("acc.delType")}
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
              {t("acc.delKeep")}
            </button>
            <button type="submit" className="danger-btn" disabled={busy || confirm.trim().toUpperCase() !== "DELETE"}>
              {busy ? t("acc.deleting") : t("acc.delForever")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const strongEnough = (pw) => pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);

/** Change password - for accounts that have one (not Google / Apple only). */
function PasswordChange() {
  const t = useT();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const problem =
    form.next && !strongEnough(form.next)
      ? t("acc.pwRule")
      : form.confirm && form.confirm !== form.next
        ? t("acc.pwNewMismatch")
        : "";
  const ready = form.current && strongEnough(form.next) && form.next === form.confirm && !busy;

  const save = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post("/me/password", { current_password: form.current, new_password: form.next });
      setForm({ current: "", next: "", confirm: "" });
      setMessage(t("acc.pwChanged"));
      haptic("success");
    } catch (err) {
      setMessage(errorMessage(err, t("acc.pwFail")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="account-row" onSubmit={save}>
      <span className="account-label">{t("acc.changePw")}</span>
      <input
        className="answer-input"
        type="password"
        placeholder={t("acc.currentPw")}
        aria-label={t("acc.currentPw")}
        autoComplete="current-password"
        value={form.current}
        onChange={set("current")}
      />
      <input
        className="answer-input"
        type="password"
        placeholder={t("acc.newPw")}
        aria-label={t("acc.newPw")}
        autoComplete="new-password"
        value={form.next}
        onChange={set("next")}
      />
      <input
        className="answer-input"
        type="password"
        placeholder={t("acc.repeatNewPw")}
        aria-label={t("acc.repeatNewPw")}
        autoComplete="new-password"
        value={form.confirm}
        onChange={set("confirm")}
      />
      {problem && <p className="account-message invalid">{problem}</p>}
      <button type="submit" className="submit-btn" disabled={!ready}>
        {busy ? t("acc.saving") : t("acc.changePw")}
      </button>
      {message && <p className="account-message">{message}</p>}
    </form>
  );
}

/**
 * For Google / Apple accounts: add a handle and password so the account can
 * also log in with them. The server then emails a code to confirm the address.
 */
function LinkPassword({ currentHandle, onLinked }) {
  const t = useT();
  const [form, setForm] = useState({ handle: currentHandle, password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const handleIssueKey = handleProblemKey(form.handle);
  const handleIssue = handleIssueKey ? t(handleIssueKey) : "";
  const problem =
    handleIssue ||
    (form.password && !strongEnough(form.password)
      ? t("acc.pwRule")
      : form.confirm && form.confirm !== form.password
        ? t("acc.pwMismatch")
        : "");
  const ready = !handleIssue && strongEnough(form.password) && form.password === form.confirm && !busy;

  const save = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post("/me/link-credentials", {
        username: form.handle.trim(),
        password: form.password,
      });
      haptic("success");
      onLinked(data.user, data.verification_sent);
    } catch (err) {
      setMessage(errorMessage(err, t("acc.saveFail")));
      setBusy(false);
    }
  };

  return (
    <form className="account-row" onSubmit={save}>
      <span className="account-label">{t("acc.linkTitle")}</span>
      <span className="account-note">{t("acc.linkNote")}</span>
      <input
        className="answer-input"
        placeholder={t("acc.handlePh")}
        aria-label={t("acc.handlePh")}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        value={form.handle}
        onChange={set("handle")}
      />
      <input
        className="answer-input"
        type="password"
        placeholder={t("acc.password")}
        aria-label={t("acc.password")}
        autoComplete="new-password"
        value={form.password}
        onChange={set("password")}
      />
      <input
        className="answer-input"
        type="password"
        placeholder={t("acc.repeatPw")}
        aria-label={t("acc.repeatPw")}
        autoComplete="new-password"
        value={form.confirm}
        onChange={set("confirm")}
      />
      {problem && <p className="account-message invalid">{problem}</p>}
      <button type="submit" className="submit-btn" disabled={!ready}>
        {busy ? t("acc.saving") : t("acc.saveLink")}
      </button>
      {message && <p className="account-message invalid">{message}</p>}
    </form>
  );
}

/** The signed-in account (/me/account), shared by the handle form and the account card. */
export function useAccount() {
  const [account, setAccount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get("/me/account")
      .then((res) => !cancelled && setAccount(res.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return [account, setAccount];
}

/**
 * Profile → identity card: the handle, full width with Save underneath, so a
 * 20-character handle is never cut off.
 */
export function HandleForm({ account, setAccount }) {
  const t = useT();
  const { updateUser } = useAuth();
  const [handle, setHandle] = useState(account?.username || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Follow the account when it loads or changes elsewhere (LinkPassword).
  useEffect(() => {
    if (account?.username) setHandle(account.username);
  }, [account?.username]);

  if (!account) return null;
  const changed = handle.trim() !== account.username;
  const problemKey = changed ? handleProblemKey(handle) : "";

  const saveHandle = async (e) => {
    e.preventDefault();
    if (problemKey) return;
    setSaving(true);
    setMessage("");
    try {
      const { data } = await api.post("/me/username", { username: handle });
      updateUser({ username: data.user.username });
      setAccount((a) => ({ ...a, username: data.user.username }));
      setMessage(t("acc.handleUpdated"));
      haptic("success");
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="handle-form" onSubmit={saveHandle}>
      <label htmlFor="handle-input" className="account-label">
        {t("acc.handle")}
      </label>
      <input
        id="handle-input"
        className="answer-input handle-input"
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
      />
      {changed && (
        <button type="submit" className="submit-btn handle-save" disabled={saving || !!problemKey}>
          {saving ? t("acc.saving") : t("acc.save")}
        </button>
      )}
      {problemKey && <p className="account-message invalid">{t(problemKey)}</p>}
      {message && <p className="account-message">{message}</p>}
    </form>
  );
}

/**
 * Profile → "Account and data" (sign-in, password, data, legal) and, last of
 * all and on its own, the danger zone: log out and delete.
 */
function AccountSettings({ account, setAccount }) {
  const t = useT();
  const { logout, updateUser, clearSession } = useAuth();
  const [showDelete, setShowDelete] = useState(false);
  const [note, setNote] = useState("");
  const [cleared, setCleared] = useState(false);

  const methods = account
    ? [
        ...(account.has_password ? [t("acc.methodPassword")] : []),
        ...account.providers.map((p) => PROVIDER_LABEL[p] || p),
      ]
    : [];

  return (
    <>
      <section className="profile-section profile-group" aria-labelledby="account-title">
        <h2 id="account-title">{t("data.title")}</h2>

        {account && (
          <div className="account-row">
            <span className="account-label">{t("acc.signsIn")}</span>
            <span>{methods.join(" · ") || "—"}</span>
            {account.email && <span className="account-email">{account.email}</span>}
          </div>
        )}

        <VerifyEmailCard />

        {account?.has_password && <PasswordChange />}
        {account && !account.has_password && (
          <LinkPassword
            currentHandle={account.username}
            onLinked={(linked, sent) => {
              updateUser({ username: linked.username, is_verified: linked.is_verified });
              setAccount((a) => ({ ...a, username: linked.username, has_password: true }));
              setNote(sent ? t("acc.savedEmail") : t("acc.savedHandle"));
            }}
          />
        )}
        {note && <p className="account-message">{note}</p>}

        <div className="account-row">
          <span className="account-label">{t("acc.yourData")}</span>
          <DataNotice />
          <AdPrivacyButton />
          <button
            type="button"
            className="btn-secondary clear-data-btn"
            onClick={() => {
              clearCache();
              updateUser({}); // keep this phone's sign-in, so the app still opens offline
              setCleared(true);
              haptic("success");
            }}
            disabled={cleared}
          >
            {t("data.clear")}
          </button>
          <span className="account-note">{cleared ? t("data.cleared") : t("data.clearNote")}</span>
        </div>

        <div className="account-row">
          <span className="account-label">{t("acc.legal")}</span>
          <LegalLinks />
          <span className="account-note">{t("acc.madeBy")}</span>
        </div>
      </section>

      <section className="profile-section danger-zone" aria-labelledby="danger-title">
        <h2 id="danger-title">{t("danger.title")}</h2>
        <button className="btn-secondary logout-btn" onClick={logout}>
          {t("acc.logout")}
        </button>
        <button className="danger-link" onClick={() => setShowDelete(true)}>
          {t("acc.delete")}
        </button>
      </section>

      {showDelete && <DeleteAccountDialog onClose={() => setShowDelete(false)} onDeleted={clearSession} />}
    </>
  );
}

export default AccountSettings;
