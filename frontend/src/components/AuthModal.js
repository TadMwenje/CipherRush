import React, { useState, useMemo } from "react";
import { Check, Close, Eye, EyeOff, Key, Mail, Terminal, User } from "../glyphs";
import api from "../api";
import SocialButtons from "./SocialButtons";
import { LegalConsent } from "./LegalLinks";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordChecks(password) {
  return {
    length: password.length >= 8,
    case: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit: /\d/.test(password),
  };
}

function AuthModal({ isOpen, onClose, onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: "", password: "", email: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState({});

  const passwordChecks = useMemo(() => getPasswordChecks(formData.password), [formData.password]);
  const passwordScore = Object.values(passwordChecks).filter(Boolean).length;
  const passwordValid = passwordScore === 3;

  const usernameValid = USERNAME_PATTERN.test(formData.username);
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
      const data = err.response?.data;
      setError(data?.detail || data?.error || "That didn't go through. Try again.");
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <div className="auth-modal-icon">
            <Terminal size={24} />
          </div>
          <h2>{isLogin ? "Log in" : "New player"}</h2>
          <p className="auth-modal-subtitle">
            {isLogin ? "Pick up where you left off." : "Ten seconds. Your progress follows you to any device."}
          </p>
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
            <label htmlFor="auth-username">Handle</label>
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
            {!isLogin && touched.username && !usernameValid && (
              <div className="auth-field-hint invalid">3–20 characters. Letters, numbers, underscores.</div>
            )}
          </div>

          {!isLogin && (
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
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
                <div className="auth-field-hint invalid">That doesn't look like an email.</div>
              )}
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
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
                aria-label={showPassword ? "Hide password" : "Show password"}
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
                    {passwordChecks.length ? <Check size={13} /> : <Close size={13} />} 8+ characters
                  </li>
                  <li className={passwordChecks.case ? "met" : ""}>
                    {passwordChecks.case ? <Check size={13} /> : <Close size={13} />} Upper and lower case
                  </li>
                  <li className={passwordChecks.digit ? "met" : ""}>
                    {passwordChecks.digit ? <Check size={13} /> : <Close size={13} />} A number
                  </li>
                </ul>
              </div>
            )}
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading || !canSubmit}>
            {loading ? (isLogin ? "Logging in" : "Creating account") : isLogin ? "Log in" : "Create account"}
          </button>
        </form>

        <LegalConsent />

        <p className="auth-switch">
          {isLogin ? "New here? " : "Got an account? "}
          <button type="button" onClick={switchMode}>
            {isLogin ? "Make one" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthModal;
