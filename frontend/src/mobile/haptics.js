// Haptic feedback.
// Inside the native app (mobile/ - Capacitor) this uses the Haptics plugin,
// which gives real taptic feedback on iOS too. In a browser it falls back to
// the Vibration API (Android Chrome; iOS Safari has none).
const VIBRATE = {
  tap: 8,
  select: 12,
  success: [14, 50, 22],
  error: [40, 30, 40],
  match: 18,
  win: [20, 40, 20, 40, 60],
};

// Capacitor Haptics equivalents.
const NATIVE = {
  tap: ["impact", { style: "LIGHT" }],
  select: ["selectionChanged"],
  match: ["impact", { style: "MEDIUM" }],
  success: ["notification", { type: "SUCCESS" }],
  error: ["notification", { type: "ERROR" }],
  win: ["notification", { type: "SUCCESS" }],
};

let enabled = true;

export function setHapticsEnabled(value) {
  enabled = value;
}

function nativeHaptics() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Haptics || null;
}

export function haptic(kind = "tap") {
  if (!enabled || typeof window === "undefined") return;
  const native = nativeHaptics();
  if (native) {
    const [method, options] = NATIVE[kind] || NATIVE.tap;
    try {
      const call = native[method]?.(options);
      if (call?.catch) call.catch(() => {});
    } catch (e) {
      // plugin missing on this build - stay silent
    }
    return;
  }
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(VIBRATE[kind] ?? VIBRATE.tap);
  } catch (e) {
    // Some browsers throw before the first user gesture - harmless.
  }
}
