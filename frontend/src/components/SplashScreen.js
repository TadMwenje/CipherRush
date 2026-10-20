import React, { useEffect, useState } from "react";
import CipherMark from "../brand/CipherMark";
import { useAuth } from "../AuthContext";

const MIN_DURATION_MS = 2200;
const EXIT_DURATION_MS = 500;

// Shown on initial load while the auth/session check runs. Stays up for at
// least MIN_DURATION_MS so the brand moment always reads intentionally,
// then cross-fades into whichever screen the router lands on.
function SplashScreen({ onFinish }) {
  const { loading: authLoading } = useAuth();
  const [minElapsed, setMinElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minElapsed && !authLoading) setExiting(true);
  }, [minElapsed, authLoading]);

  // Separate effect so flipping `exiting` doesn't cancel its own finish timer.
  useEffect(() => {
    if (!exiting) return undefined;
    const timer = setTimeout(onFinish, EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [exiting, onFinish]);

  return (
    <div className={`splash-screen${exiting ? " splash-exit" : ""}`} role="status" aria-live="polite">
      <div className="splash-vortex" aria-hidden="true">
        <div className="splash-vortex-swirl" />
        <div className="splash-stars" />
      </div>

      <div className="splash-content">
        <div className="splash-header">
          <h1 className="splash-title">CipherRush</h1>
          <p className="splash-subtitle">Ciphers, scams and bytes.</p>
        </div>

        <div className="splash-center">
          <CipherMark size={200} animated />
        </div>

        <div className="splash-footer">
          <div className="splash-tagline">&nbsp;</div>

          <div className="splash-loading">
            <div className="splash-progress-track">
              <div className="splash-progress-fill" />
            </div>
            <div className="splash-loading-label">
              <span className="splash-spinner" aria-hidden="true" />
              Loading
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
