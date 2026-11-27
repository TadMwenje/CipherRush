/*
 * Rewarded ads, granted by the server, never by the app. The flow:
 * ask the server for a reward slot -> show the ad tagged with it -> Google tells
 * our server the ad was watched (signed callback) -> poll until it's earned ->
 * hand the reward id to the game endpoint that spends it (backend/ads.py).
 */
import api from "../api";
import { t } from "../i18n";
import { showAd } from "./admob";
import { noteAdShown } from "./pacing";

const POLL_MS = 1000;
const POLL_FOR_MS = 20000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A failure with a message written for the player (already translated). */
export class RewardError extends Error {
  constructor(message) {
    super(message);
    this.playerMessage = message;
  }
}

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
    throw new RewardError(t("reward.noVideo"));
  }
  noteAdShown(); // no interstitial straight after a video they chose to watch
  if (!outcome.rewarded) throw new RewardError(t("reward.closedEarly"));

  // Google's callback usually lands within a second or two.
  const deadline = Date.now() + pollForMs;
  while (Date.now() < deadline) {
    const { data: s } = await api.get(`/ads/rewards/${data.reward_id}`);
    if (s.status === "earned") return data.reward_id;
    if (s.status === "used") break;
    await sleep(pollMs);
  }
  throw new RewardError(t("reward.unconfirmed"));
}
