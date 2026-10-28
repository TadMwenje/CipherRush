/*
 * Rewarded ads, granted by the server, never by the app. The flow:
 * ask the server for a reward slot -> show the ad tagged with it -> Google tells
 * our server the ad was watched (signed callback) -> poll until it's earned ->
 * hand the reward id to the game endpoint that spends it (backend/ads.py).
 */
import api from "../api";
import { showAd } from "./admob";
import { noteAdShown } from "./pacing";

const POLL_MS = 1000;
const POLL_FOR_MS = 20000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RewardError extends Error {}

/**
 * kind: "hint" | "continue" | "boost". Resolves with the earned reward id,
 * or throws RewardError with a message fit to show the player.
 */
export async function earnReward(kind, roundId = null, { pollMs = POLL_MS, pollForMs = POLL_FOR_MS } = {}) {
  const { data } = await api.post("/ads/rewards", { kind, round_id: roundId });
  const format = kind === "boost" ? "rewardedInterstitial" : "rewarded";
  let outcome;
  try {
    outcome = await showAd(format, { ssv: { userId: data.user_id, customData: data.reward_id } });
  } catch {
    throw new RewardError("No video available right now. Try again in a bit.");
  }
  noteAdShown(); // no interstitial straight after a video they chose to watch
  if (!outcome.rewarded) throw new RewardError("The video was closed early, so there's no reward this time.");

  // Google's callback usually lands within a second or two.
  const deadline = Date.now() + pollForMs;
  while (Date.now() < deadline) {
    const { data: s } = await api.get(`/ads/rewards/${data.reward_id}`);
    if (s.status === "earned") return data.reward_id;
    if (s.status === "used") break;
    await sleep(pollMs);
  }
  throw new RewardError("Couldn't confirm the reward with the server. Try again.");
}
