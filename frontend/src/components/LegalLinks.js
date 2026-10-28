import React from "react";
import { LEGAL_URLS, openExternal } from "../legal";

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
  return (
    <p className="legal-consent data-notice">
      Your handle, email and game results are sent over an encrypted connection to CipherRush's server
      (api.aximoix.com) to run your account and the leaderboards. Your IP address is used for security and rate
      limits. No ads, no trackers.
    </p>
  );
}

export { ExternalLink };
