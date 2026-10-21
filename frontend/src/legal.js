// CipherRush's legal terms are AximoIX's - published and maintained on aximoix.com.
// The anchors jump straight to the CipherRush sections; the full pages still load.
export const LEGAL_URLS = {
  terms: "https://aximoix.com/terms/#cipherrush",
  privacy: "https://aximoix.com/privacy/#cipherrush",
  accountDeletion: "https://aximoix.com/privacy/#cipherrush-delete",
};

/**
 * Open a URL outside the game. In the native app this uses the in-app browser
 * (SFSafariViewController / Chrome Custom Tabs via @capacitor/browser), which
 * store reviewers expect for legal pages; on the web, a new tab.
 */
export function openExternal(url) {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  const browser = cap?.isNativePlatform?.() ? cap.Plugins?.Browser : null;
  if (browser) {
    browser.open({ url, presentationStyle: "popover" }).catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
