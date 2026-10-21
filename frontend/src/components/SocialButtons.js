import React, { useEffect, useRef, useState } from "react";
import { errorMessage } from "../api";
import { haptic } from "../mobile/haptics";
import {
  availableProviders,
  isCancel,
  platform,
  renderGoogleWebButton,
  signInWithApple,
  signInWithGoogleNative,
} from "../auth/socialAuth";

// Brand marks as required by Google's and Apple's sign-in button guidelines.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" aria-hidden="true" fill="currentColor">
      <path d="M14.2 10.6c0-2.5 2.1-3.7 2.2-3.8-1.2-1.7-3-2-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9C4 4.9 2.4 5.9 1.5 7.4c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.9-1.1-3-4.1zM11.7 3.3C12.4 2.4 12.9 1.2 12.7 0c-1 .1-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5z" />
    </svg>
  );
}

/**
 * "Continue with Apple / Google" buttons. Renders nothing until we know which
 * providers are switched on, so nothing broken ever shows.
 */
function SocialButtons({ onSignedIn, onError, disabled = false }) {
  const [providers, setProviders] = useState(null);
  const [busy, setBusy] = useState(null);
  const googleWebRef = useRef(null);
  const web = platform() === "web";

  useEffect(() => {
    let cancelled = false;
    availableProviders().then((p) => !cancelled && setProviders(p));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!web || !providers?.google || !googleWebRef.current) return;
    const width = Math.min(360, googleWebRef.current.offsetWidth || 320);
    renderGoogleWebButton(googleWebRef.current, {
      width,
      onSuccess: (data) => onSignedIn(data),
      onError: (err) => onError(errorMessage(err, "Google sign-in didn't go through.")),
    }).catch(() => onError("Couldn't load Google sign-in."));
  }, [web, providers, onSignedIn, onError]);

  if (!providers || (!providers.google && !providers.apple)) return null;

  const run = async (kind, fn) => {
    haptic("tap");
    setBusy(kind);
    try {
      onSignedIn(await fn());
    } catch (err) {
      if (!isCancel(err)) onError(errorMessage(err, `${kind} sign-in didn't go through.`));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="social-buttons">
      {providers.apple && (
        <button
          type="button"
          className="social-btn apple"
          onClick={() => run("Apple", signInWithApple)}
          disabled={disabled || Boolean(busy)}
        >
          <AppleMark /> {busy === "Apple" ? "Signing in" : "Continue with Apple"}
        </button>
      )}
      {providers.google &&
        (web ? (
          <div ref={googleWebRef} className="social-google-web" />
        ) : (
          <button
            type="button"
            className="social-btn google"
            onClick={() => run("Google", signInWithGoogleNative)}
            disabled={disabled || Boolean(busy)}
          >
            <GoogleMark /> {busy === "Google" ? "Signing in" : "Continue with Google"}
          </button>
        ))}
      <div className="social-divider" role="separator">
        <span>or use a handle</span>
      </div>
    </div>
  );
}

export default SocialButtons;
