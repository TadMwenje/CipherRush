/*
 * Audio settings, shared by the in-game speaker button and Profile →
 * Preferences, and saved on this device. One store, so changing a setting in
 * either place updates the other straight away.
 *
 *   music   background loop on game screens
 *   sfx     taps, chimes, buzzes and fanfares
 *   volume  0..1, on top of the phone's own volume buttons
 *   muted   the quick speaker toggle; keeps music/sfx/volume as they were
 */
import { useSyncExternalStore } from "react";

const KEY = "cr_audio";
const LEGACY_SOUND_KEY = "cr_sound"; // 1.0.2 pre-release: sound effects on/off only

export const DEFAULT_AUDIO = Object.freeze({ music: true, sfx: true, volume: 0.7, muted: false });

export function clampVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_AUDIO.volume;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}

function normalise(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    music: typeof s.music === "boolean" ? s.music : DEFAULT_AUDIO.music,
    sfx: typeof s.sfx === "boolean" ? s.sfx : DEFAULT_AUDIO.sfx,
    volume: s.volume === undefined ? DEFAULT_AUDIO.volume : clampVolume(s.volume),
    muted: typeof s.muted === "boolean" ? s.muted : DEFAULT_AUDIO.muted,
  };
}

function load() {
  const store = storage();
  if (!store) return { ...DEFAULT_AUDIO };
  try {
    const saved = store.getItem(KEY);
    if (saved) return normalise(JSON.parse(saved));
    // Carry over the earlier sound-effects switch.
    if (store.getItem(LEGACY_SOUND_KEY) === "off") return { ...DEFAULT_AUDIO, sfx: false };
  } catch (e) {
    // unreadable: fall back to defaults
  }
  return { ...DEFAULT_AUDIO };
}

let state = load();
const listeners = new Set();

export function getAudioSettings() {
  return state;
}

/** Merge a change, clamp it, save it, and tell everyone listening. */
export function setAudioSettings(patch) {
  const next = normalise({ ...state, ...patch });
  if (
    next.music === state.music &&
    next.sfx === state.sfx &&
    next.volume === state.volume &&
    next.muted === state.muted
  ) {
    return state;
  }
  state = next;
  const store = storage();
  try {
    store?.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // not saved, but still applies until the app closes
  }
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      // one bad listener mustn't stop the others
    }
  });
  return state;
}

export function toggleMuted() {
  return setAudioSettings({ muted: !state.muted });
}

export function subscribeAudioSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook: the current settings, re-rendering when they change anywhere. */
export function useAudioSettings() {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings, getAudioSettings);
}

// Tests only: re-read from storage. Listeners stay (the sound engine's included).
export function _reloadAudioSettingsForTests() {
  state = load();
}
