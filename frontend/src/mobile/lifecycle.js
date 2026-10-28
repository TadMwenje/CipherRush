/*
 * App backgrounding and resume.
 *
 * Phones suspend the web view when the player switches apps or locks the
 * screen. JS timers stop, in-flight requests can be cut off, and the
 * monotonic clock may or may not have kept ticking. When the app comes back
 * the screen must pick up from the server's truth rather than wait on
 * something that died while it was asleep.
 *
 * Two sources, deduplicated: the page's visibilitychange (browsers, and the
 * native web view most of the time) and the Capacitor App plugin's
 * appStateChange (reliable on both iOS and Android).
 *
 * While backgrounded, html.app-paused stops every CSS animation so the GPU
 * and battery are left alone, and the OS is less likely to kill the web view.
 */
const pauseListeners = new Set();
const resumeListeners = new Set();
let hiddenAt = null;

function emit(set, arg) {
  set.forEach((fn) => {
    try {
      fn(arg);
    } catch (e) {
      // one bad listener mustn't stop the others
    }
  });
}

export function isBackgrounded() {
  return hiddenAt !== null;
}

export function enterBackground(now = Date.now()) {
  if (hiddenAt !== null) return;
  hiddenAt = now;
  document.documentElement.classList.add("app-paused");
  emit(pauseListeners);
}

export function enterForeground(now = Date.now()) {
  if (hiddenAt === null) return;
  const awayMs = Math.max(0, now - hiddenAt);
  hiddenAt = null;
  document.documentElement.classList.remove("app-paused");
  emit(resumeListeners, { awayMs });
}

/** fn() when the app goes to the background. Returns an unsubscribe function. */
export function onAppPause(fn) {
  pauseListeners.add(fn);
  return () => pauseListeners.delete(fn);
}

/** fn({ awayMs }) when the app comes back. Returns an unsubscribe function. */
export function onAppResume(fn) {
  resumeListeners.add(fn);
  return () => resumeListeners.delete(fn);
}

function nativeApp() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.App || null;
}

let installed = false;
export function installLifecycle() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") enterBackground();
    else enterForeground();
  });
  // iOS Safari sometimes skips visibilitychange on a swipe-away but fires these.
  window.addEventListener("pagehide", () => enterBackground());
  window.addEventListener("pageshow", () => document.visibilityState !== "hidden" && enterForeground());

  const app = nativeApp();
  if (!app) return;
  try {
    app.addListener("appStateChange", ({ isActive }) => (isActive ? enterForeground() : enterBackground()));
  } catch (e) {
    // plugin missing on this build - visibilitychange still covers it
  }
}

// Tests only.
export function _resetLifecycleForTests() {
  hiddenAt = null;
  pauseListeners.clear();
  resumeListeners.clear();
  document.documentElement.classList.remove("app-paused");
}
