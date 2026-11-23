import React from "react";
import { LEGAL_URLS, openExternal } from "../legal";
import { adsAvailable } from "../ads/admob";
import { rich, useLanguage, useT } from "../i18n";

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
  const t = useT();
  return (
    <nav className={`legal-links ${className}`} aria-label={t("acc.legal")}>
      <ExternalLink href={LEGAL_URLS.terms}>{t("legal.terms")}</ExternalLink>
      <span aria-hidden="true">·</span>
      <ExternalLink href={LEGAL_URLS.privacy}>{t("legal.privacy")}</ExternalLink>
    </nav>
  );
}

/** The consent line under sign-up / sign-in buttons. */
export function LegalConsent() {
  const t = useT();
  const lang = useLanguage();
  return (
    <p className="legal-consent">
      {rich(
        "legal.consent",
        {
          terms: <ExternalLink href={LEGAL_URLS.terms}>{t("legal.terms")}</ExternalLink>,
          privacy: <ExternalLink href={LEGAL_URLS.privacy}>{t("legal.privacyPolicy")}</ExternalLink>,
        },
        lang
      )}
    </p>
  );
}

/** What an account sends and why - shown at sign-up and in Profile → Account. */
export function DataNotice() {
  const t = useT();
  // The web version has no ads; the apps show Google AdMob ads.
  const ads = adsAvailable();
  return (
    <p className="legal-consent data-notice">
      {t("legal.data")} {ads ? t("legal.ads") : t("legal.noAds")}
    </p>
  );
}

export { ExternalLink };
