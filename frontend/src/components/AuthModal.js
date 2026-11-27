import React, { useState, useMemo } from "react";
import { Check, Close, Eye, EyeOff, Key, Mail, Terminal, User } from "../glyphs";
import api, { errorMessage } from "../api";
import SocialButtons from "./SocialButtons";
import { LegalConsent, DataNotice } from "./LegalLinks";
import { handleProblemKey } from "../moderation/handle";
import { useT } from "../i18n";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordChecks(password) {
  return {
    length: password.length >= 8,
    case: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
  };
}

/** Handle or email in; always the same answer back, whether or not an account exists. */
function ForgotPassword({ onBack }) {
  const t = useT();
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (identifier.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/auth/forgot-password", { identifier: identifier.trim() });
      setSent(data.message);
    } catch (err) {
      setError(errorMessage(err, t("auth.sendFail")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-modal-header">
        <div className="auth-modal-icon">
          <Key size={24} />
        </div>
        <h2>{t("auth.reset")}</h2>
        <p className="auth-modal-subtitle">{t("auth.resetSub")}</p>
      </div>
      {error && (
        <p className="auth-message auth-message-top" role="alert">
          {error}
        </p>
      )}
      {sent ? (
        <p className="auth-message success" role="status">
          {sent} {t("auth.sentNote")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-forgot">{t("auth.handleOrEmail")}</label>
            <div className="auth-input-wrap">
              <User size={17} className="auth-input-icon" aria-hidden="true" />
              <input
                id="auth-forgot"
                type="text"
                placeholder="your_handle"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>
          <button type="submit" className="auth-submit-btn" disabled={busy || identifier.trim().length < 3}>
            {busy ? t("auth.sending") : t("auth.emailLink")}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <button type="button" onClick={onBack}>
          {t("auth.backToLogin")}
        </button>
      </p>
    </>
  );
}

function AuthModal({ isOpen, onClose, onLogin }) {
  const t = useT();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: "", password: "", email: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState({});
  const [forgot, setForgot] = useState(false);

  const passwordChecks = useMemo(() => getPasswordChecks(formData.password), [formData.password]);
  const passwordScore = Object.values(passwordChecks).filter(Boolean).length;
  const passwordValid = passwordScore === 3;

  const usernameProblemKey = handleProblemKey(formData.username);
  const usernameProblem = usernameProblemKey ? t(usernameProblemKey) : "";
  const usernameValid = !usernameProblem;
  const emailValid = EMAIL_PATTERN.test(formData.email);

  const canSubmit = isLogin
    ? formData.username.trim().length > 0 && formData.password.length > 0
    : usernameValid && emailValid && passwordValid;

  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      setTouched({ username: true, email: true, password: true });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin ? { username: formData.username, password: formData.password } : formData;
      const response = await api.post(endpoint, payload);
      // Login and sign-up both return a live session - straight into the game.
      onLogin(response.data.user);
      onClose();
    } catch (err) {
      setError(errorMessage(err, t("auth.failed")));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError("");
    setTouched({});
  };

  if (!isOpen) return null;

  if (forgot) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
          <ForgotPassword onBack={() => setForgot(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <div className="auth-modal-icon">
            <Terminal size={24} />
          </div>
          <h2>{isLogin ? t("auth.login") : t("auth.newPlayer")}</h2>
          <p className="auth-modal-subtitle">{isLogin ? t("auth.loginSub") : t("auth.signupSub")}</p>
        </div>

        {error && (
          <p className="auth-message auth-message-top" role="alert">
            {error}
          </p>
        )}

        <SocialButtons
          disabled={loading}
          onSignedIn={(data) => {
            onLogin(data.user);
            onClose();
          }}
          onError={setError}
        />

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-username">{t("auth.handle")}</label>
            <div className={`auth-input-wrap${touched.username && !isLogin && !usernameValid ? " invalid" : ""}`}>
              <User size={17} className="auth-input-icon" aria-hidden="true" />
              <input
                id="auth-username"
                type="text"
                placeholder="your_handle"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                onBlur={() => markTouched("username")}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
            {!isLogin && (touched.username || formData.username.length >= 3) && !usernameValid && (
              <div className="auth-field-hint invalid">{usernameProblem}</div>
            )}
          </div>

          {!isLogin && (
            <div className="auth-field">
              <label htmlFor="auth-email">{t("auth.email")}</label>
              <div className={`auth-input-wrap${touched.email && !emailValid ? " invalid" : ""}`}>
                <Mail size={17} className="auth-input-icon" aria-hidden="true" />
                <input
                  id="auth-email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  onBlur={() => markTouched("email")}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  required
                />
              </div>
              {touched.email && !emailValid && (
                <div className="auth-field-hint invalid">{t("auth.badEmail")}</div>
              )}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-password">{t("auth.password")}</label>
            <div className={`auth-input-wrap${touched.password && !isLogin && !passwordValid ? " invalid" : ""}`}>
              <Key size={17} className="auth-input-icon" aria-hidden="true" />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onBlur={() => markTouched("password")}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? t("auth.hidePw") : t("auth.showPw")}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {!isLogin && formData.password.length > 0 && (
              <div className="password-strength">
                <div className="password-strength-bar">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`password-strength-segment${i < passwordScore ? ` filled s${passwordScore}` : ""}`}
                    />
                  ))}
                </div>
                <ul className="password-checklist">
                  <li className={passwordChecks.length ? "met" : ""}>
                    {passwordChecks.length ? <Check size={13} /> : <Close size={13} />} {t("auth.pw8")}
                  </li>
                  <li className={passwordChecks.case ? "met" : ""}>
                    {passwordChecks.case ? <Check size={13} /> : <Close size={13} />} {t("auth.pwCase")}
                  </li>
                  <li className={passwordChecks.digit ? "met" : ""}>
                    {passwordChecks.digit ? <Check size={13} /> : <Close size={13} />} {t("auth.pwDigit")}
                  </li>
                </ul>
              </div>
            )}
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading || !canSubmit}>
            {loading
              ? isLogin
                ? t("auth.loggingIn")
                : t("auth.creating")
              : isLogin
                ? t("auth.login")
                : t("auth.create")}
          </button>
          {isLogin && (
            <button type="button" className="text-link-btn auth-forgot-link" onClick={() => setForgot(true)}>
              {t("auth.forgot")}
            </button>
          )}
        </form>

        {!isLogin && <DataNotice />}
        <LegalConsent />

        <p className="auth-switch">
          {isLogin ? t("auth.newHere") : t("auth.gotAccount")}{" "}
          <button type="button" onClick={switchMode}>
            {isLogin ? t("auth.makeOne") : t("auth.login")}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthModal;
