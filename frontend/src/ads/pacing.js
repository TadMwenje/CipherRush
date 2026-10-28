/*
 * When ads may appear, so they never get in the way of play.
 *
 * Interstitials: only at a break the player chose (leaving a finished round,
 * starting the next one), after every ROUNDS_PER_INTERSTITIAL finished rounds,
 * never twice within MIN_GAP_MS, and not right after a rewarded video.
 *
 * Double-points offer (rewarded interstitial): on starting a scored mode, at
 * most every BOOST_EVERY_STARTS starts; the server caps boosts at 3 a day.
 */
import { adsAvailable, showAd } from "./admob";

export const ROUNDS_PER_INTERSTITIAL = 3;
export const MIN_GAP_MS = 2 * 60 * 1000;
export const BOOST_EVERY_STARTS = 4;
export const BOOST_MODES = new Set(["cipher", "quiz", "truefalse", "binhex", "match3", "memory"]);

const state = { roundsSinceAd: 0, lastAdAt: 0, startsSinceOffer: 0 };

export function _resetPacingForTests() {
  Object.assign(state, { roundsSinceAd: 0, lastAdAt: 0, startsSinceOffer: 0 });
}

/** Call once per finished round (scored or practice). */
export function noteRoundFinished() {
  state.roundsSinceAd += 1;
}

/** Call after any full-screen ad, so the next interstitial waits. */
export function noteAdShown(now = Date.now()) {
  state.lastAdAt = now;
  state.roundsSinceAd = 0;
}

export function interstitialDue(now = Date.now()) {
  return state.roundsSinceAd >= ROUNDS_PER_INTERSTITIAL && now - state.lastAdAt >= MIN_GAP_MS;
}

/**
 * At a break between rounds: show an interstitial if one is due, then carry on.
 * Never throws and never blocks the player for long - a failed ad just skips.
 */
export async function atRoundBreak() {
  if (!adsAvailable() || !interstitialDue()) return;
  noteAdShown();
  try {
    await showAd("interstitial");
  } catch {
    // No fill or no signal: nothing to show, nothing lost.
  }
}

/** Whether to offer double points as this mode starts. */
export function shouldOfferBoost(mode) {
  if (!adsAvailable() || !BOOST_MODES.has(mode)) return false;
  state.startsSinceOffer += 1;
  if (state.startsSinceOffer < BOOST_EVERY_STARTS) return false;
  state.startsSinceOffer = 0;
  return true;
}

/**
 * onClick wrapper for "next round" buttons: a due interstitial first, then fn.
 * With no ad due, fn runs inside the tap itself (iOS only opens the keyboard there).
 */
export const afterBreak = (fn) => () => {
  if (!adsAvailable() || !interstitialDue()) return fn();
  return atRoundBreak().then(() => fn());
};
