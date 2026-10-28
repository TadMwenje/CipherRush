import React from "react";
import { LEGAL_URLS, openExternal } from "../legal";
import { adsAvailable } from "../ads/admob";

function ExternalLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

/** "Terms · Privacy" - for footers and settings. */
export function LegalLinks({ className = "" }) {
  return (
    <nav className={`legal-links ${className}`} aria-label="Legal">
      <ExternalLink href={LEGAL_URLS.terms}>Terms</ExternalLink>
      <span aria-hidden="true">·</span>
      <ExternalLink href={LEGAL_URLS.privacy}>Privacy</ExternalLink>
    </nav>
  );
}

/** The consent line under sign-up / sign-in buttons. */
export function LegalConsent() {
  return (
    <p className="legal-consent">
      By continuing you agree to the <ExternalLink href={LEGAL_URLS.terms}>Terms</ExternalLink> and{" "}
      <ExternalLink href={LEGAL_URLS.privacy}>Privacy Policy</ExternalLink>. CipherRush is run by AximoIX.
    </p>
  );
}

/** What an account sends and why - shown at sign-up and in Profile → Account. */
export function DataNotice() {
  // The web version has no ads; the apps show Google AdMob ads.
  const ads = adsAvailable();
  return (
    <p className="legal-consent data-notice">
      Your handle, email and game results are sent over an encrypted connection to CipherRush's server
      (api.aximoix.com) to run your account and the leaderboards. Your IP address is used for security and rate
      limits. We only email you to confirm your address or reset your password.{" "}
      {ads
        ? "The app shows ads from Google AdMob. They're never personalised, but Google receives your device's advertising ID and IP address to serve them and to stop fraud."
        : "No ads, no trackers."}
    </p>
  );
}

export { ExternalLink };
