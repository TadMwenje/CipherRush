/*
 * One answer to "is the phone online?" for the whole app.
 *
 * In the native app this comes from the Capacitor Network plugin, which reads
 * the OS connectivity state directly. WKWebView's navigator.onLine is known to
 * go stale after a Wi-Fi/cellular switch (it can stay false after the signal
 * is back), which is what used to leave the "Reconnecting" banner stuck. In a
 * plain browser the online/offline events are all we have, so we use those.
 *
 * Nothing here polls: the OS pushes changes to us.
 */
const listeners = new Set();
let state = {
  online: typeof navigator === "undefined" || navigator.onLine !== false,
  type: "unknown", // wifi | cellular | none | unknown
};
let nativeSource = false;

function nativeNetwork() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Network || null;
}

export function setNetworkState(online, type = state.type) {
  const next = { online: Boolean(online), type: online ? type : "none" };
  if (next.online === state.online && next.type === state.type) return;
  state = next;
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      // one bad listener mustn't stop the others
    }
  });
}

export function isOnline() {
  return state.online;
}

export function networkState() {
  return state;
}

/** The user (or OS) asked us to go easy on data: Android Data Saver, Chrome Lite mode. */
export function prefersReducedData() {
  if (typeof navigator === "undefined") return false;
  return navigator.connection?.saveData === true;
}

/** fn(state) on every change. Returns an unsubscribe function. */
export function onNetworkChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Resolves true as soon as we're online, or false after maxWaitMs. Never
 * waits forever: a request parked here must eventually settle so the screen
 * that's waiting on it can show an error instead of hanging.
 */
export function whenOnline(maxWaitMs = 20000) {
  if (state.online) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timer = null;
    const off = onNetworkChange((s) => {
      if (!s.online) return;
      clearTimeout(timer);
      off();
      resolve(true);
    });
    timer = setTimeout(() => {
      off();
      resolve(false);
    }, maxWaitMs);
  });
}

/** Re-read the OS state (changes can be missed while the app is suspended). */
export function refreshNetworkState() {
  const native = nativeSource ? nativeNetwork() : null;
  if (!native) {
    if (typeof navigator !== "undefined") setNetworkState(navigator.onLine !== false);
    return Promise.resolve(state);
  }
  return native
    .getStatus()
    .then((s) => setNetworkState(s.connected, s.connectionType))
    .catch(() => {})
    .then(() => state);
}

let installed = false;
export function installNetworkMonitor() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("online", () => !nativeSource && setNetworkState(true));
  window.addEventListener("offline", () => !nativeSource && setNetworkState(false));

  const native = nativeNetwork();
  if (!native) return;
  nativeSource = true;
  try {
    native
      .getStatus()
      .then((s) => setNetworkState(s.connected, s.connectionType))
      .catch(() => {
        nativeSource = false;
      });
    native.addListener("networkStatusChange", (s) => setNetworkState(s.connected, s.connectionType));
  } catch (e) {
    // plugin missing on this build - browser events still work
    nativeSource = false;
  }
}

// Tests only.
export function _resetNetworkForTests(online = true) {
  state = { online, type: online ? "unknown" : "none" };
  listeners.clear();
}
