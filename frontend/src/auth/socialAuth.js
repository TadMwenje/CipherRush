/*
 * Sign in with Google / Apple - client side.
 *
 * The client only ever obtains an ID token from Google or Apple and hands it to
 * our backend (POST /api/auth/google | /api/auth/apple), which verifies it and
 * sets the session cookies. No client secrets live here - only public client IDs.
 *
 *  - Native app (mobile/, Capacitor): @capgo/capacitor-social-login via the
 *    Capacitor bridge. Google is initialised with the shared Web client ID
 *    (webClientId / iOSServerClientId) so the ID token's audience is the one
 *    the backend accepts. Apple shows on iOS only (Apple's requirement; the
 *    Android flow needs a separate web redirect).
 *  - Web: Google Identity Services (renders Google's own button) and Sign in
 *    with Apple JS (popup).
 *
 * Config (frontend/.env, build-time, all public):
 *   REACT_APP_GOOGLE_WEB_CLIENT_ID   Web OAuth client (also the server audience)
 *   REACT_APP_GOOGLE_IOS_CLIENT_ID   iOS OAuth client
 *   REACT_APP_APPLE_SERVICE_ID       Services ID for Apple on the web
 *   REACT_APP_APPLE_REDIRECT_URI     https redirect registered for that Services ID
 */
import api from "../api";

export const SOCIAL_CONFIG = {
  googleWebClientId: process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID || "",
  googleIosClientId: process.env.REACT_APP_GOOGLE_IOS_CLIENT_ID || "",
  appleServiceId: process.env.REACT_APP_APPLE_SERVICE_ID || "",
  appleRedirectUri: process.env.REACT_APP_APPLE_REDIRECT_URI || "",
};

const GSI_SRC = "https://accounts.google.com/gsi/client";
const APPLE_JS_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

export function platform() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return cap?.isNativePlatform?.() ? cap.getPlatform() : "web";
}

function nativePlugin() {
  return platform() !== "web" ? window.Capacitor?.Plugins?.SocialLogin || null : null;
}

/** A fresh random nonce; the backend checks the token carries it (or its SHA-256). */
export function makeNonce() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}

/** Which buttons to show: the server must accept the provider AND this build must be configured for it. */
export async function availableProviders() {
  let server = { google: false, apple: false };
  try {
    server = (await api.get("/auth/providers")).data;
  } catch (e) {
    return { google: false, apple: false };
  }
  const p = platform();
  const googleReady =
    Boolean(SOCIAL_CONFIG.googleWebClientId) && (p !== "ios" || Boolean(SOCIAL_CONFIG.googleIosClientId));
  const appleReady =
    p === "ios" || (p === "web" && Boolean(SOCIAL_CONFIG.appleServiceId && SOCIAL_CONFIG.appleRedirectUri));
  return {
    google: server.google && googleReady && (p === "web" || Boolean(nativePlugin())),
    apple: server.apple && appleReady && (p === "web" || Boolean(nativePlugin())),
  };
}

let nativeInit = null;
function initNative() {
  const plugin = nativePlugin();
  if (!plugin) throw new Error("Sign-in isn't available in this build.");
  if (!nativeInit) {
    const options = {
      google: {
        webClientId: SOCIAL_CONFIG.googleWebClientId,
        iOSClientId: SOCIAL_CONFIG.googleIosClientId,
        iOSServerClientId: SOCIAL_CONFIG.googleWebClientId,
        mode: "online",
      },
    };
    if (platform() === "ios") options.apple = { useProperTokenExchange: true };
    nativeInit = plugin.initialize(options).catch((err) => {
      nativeInit = null;
      throw err;
    });
  }
  return nativeInit.then(() => plugin);
}

// --- Google ----------------------------------------------------------------------

/** Native: open the Google sheet and exchange the ID token. Resolves to the backend response. */
export async function signInWithGoogleNative() {
  const plugin = await initNative();
  const nonce = makeNonce();
  const res = await plugin.login({ provider: "google", options: { scopes: ["email", "profile"], nonce } });
  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error("Google didn't return a sign-in token.");
  return (await api.post("/auth/google", { id_token: idToken, nonce })).data;
}

/**
 * Web: render Google's own button into `element`. Google requires its branded
 * button on the web; the callback fires with the backend response.
 */
export async function renderGoogleWebButton(element, { onSuccess, onError, width = 320 }) {
  await loadScript(GSI_SRC);
  const nonce = makeNonce();
  window.google.accounts.id.initialize({
    client_id: SOCIAL_CONFIG.googleWebClientId,
    nonce,
    ux_mode: "popup",
    callback: async ({ credential }) => {
      try {
        onSuccess((await api.post("/auth/google", { id_token: credential, nonce })).data);
      } catch (err) {
        onError(err);
      }
    },
  });
  window.google.accounts.id.renderButton(element, {
    theme: "filled_black",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width,
  });
}

// --- Apple -----------------------------------------------------------------------

export async function signInWithApple() {
  const nonce = makeNonce();
  if (platform() !== "web") {
    const plugin = await initNative();
    const res = await plugin.login({ provider: "apple", options: { scopes: ["email", "name"], nonce } });
    const r = res?.result || {};
    if (!r.idToken) throw new Error("Apple didn't return a sign-in token.");
    return (
      await api.post("/auth/apple", {
        identity_token: r.idToken,
        authorization_code: r.authorizationCode || undefined,
        nonce,
        given_name: r.profile?.givenName || undefined,
        family_name: r.profile?.familyName || undefined,
      })
    ).data;
  }

  await loadScript(APPLE_JS_SRC);
  window.AppleID.auth.init({
    clientId: SOCIAL_CONFIG.appleServiceId,
    scope: "name email",
    redirectURI: SOCIAL_CONFIG.appleRedirectUri,
    usePopup: true,
    nonce,
  });
  const res = await window.AppleID.auth.signIn();
  return (
    await api.post("/auth/apple", {
      identity_token: res.authorization.id_token,
      authorization_code: res.authorization.code || undefined,
      nonce,
      given_name: res.user?.name?.firstName || undefined,
      family_name: res.user?.name?.lastName || undefined,
    })
  ).data;
}

/** User closed the sheet / popup - not an error worth showing. */
export function isCancel(err) {
  const msg = String(err?.message || err?.error || err || "").toLowerCase();
  return msg.includes("cancel") || msg.includes("popup_closed") || msg.includes("user_cancelled");
}
