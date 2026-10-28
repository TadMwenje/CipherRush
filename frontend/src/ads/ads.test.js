import api from "../api";
import { adRequest, AD_UNITS } from "./config";
import { initAds, showAd } from "./admob";
import { earnReward, RewardError } from "./rewards";
import {
  _resetPacingForTests,
  afterBreak,
  BOOST_EVERY_STARTS,
  interstitialDue,
  MIN_GAP_MS,
  noteAdShown,
  noteRoundFinished,
  ROUNDS_PER_INTERSTITIAL,
  shouldOfferBoost,
} from "./pacing";

jest.mock("../api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// A stand-in for @capacitor-community/admob: `outcome` decides what the next ad does.
// Built fresh for each test, since CRA resets mock implementations between tests.
const listeners = {};
let outcome = "watched";
let admob;

function fakePlugin() {
  return {
    initialize: jest.fn(async () => {}),
    requestConsentInfo: jest.fn(async () => ({ status: "NOT_REQUIRED", canRequestAds: true })),
    addListener: jest.fn(async (name, fn) => {
      listeners[name] = fn;
      return { remove: () => delete listeners[name] };
    }),
    prepareInterstitial: jest.fn(async () => {}),
    prepareRewardVideoAd: jest.fn(async () => {}),
    prepareRewardInterstitialAd: jest.fn(async () => {}),
    showInterstitial: jest.fn(async () => play("interstitialAdDismissed", "interstitialAdFailedToShow")),
    showRewardVideoAd: jest.fn(async () =>
      play("onRewardedVideoAdDismissed", "onRewardedVideoAdFailedToShow", "onRewardedVideoAdReward"),
    ),
    showRewardInterstitialAd: jest.fn(async () =>
      play(
        "onRewardedInterstitialAdDismissed",
        "onRewardedInterstitialAdFailedToShow",
        "onRewardedInterstitialAdReward",
      ),
    ),
  };
}

function play(dismissed, failed, rewarded) {
  setTimeout(() => {
    if (outcome === "failed") return listeners[failed]();
    if (outcome === "watched" && rewarded) listeners[rewarded]({ type: "Reward", amount: 1 });
    listeners[dismissed]();
  });
}

const native = () => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android", Plugins: { AdMob: admob } };
};

beforeEach(() => {
  admob = fakePlugin();
  native();
  outcome = "watched";
  _resetPacingForTests();
});

afterAll(() => delete window.Capacitor);

// --- requests ---------------------------------------------------------------

test("every request is non-personalised and test builds never ask for live ads", () => {
  const req = adRequest("android", "rewarded");
  expect(req).toMatchObject({ adId: AD_UNITS.android.rewarded, npa: true, isTesting: true });
  expect(adRequest("ios", "interstitial").adId).toBe(AD_UNITS.ios.interstitial);
});

test("ads start only after the consent check", async () => {
  await initAds();
  expect(admob.initialize).toHaveBeenCalled();
  expect(admob.requestConsentInfo).toHaveBeenCalled();
  expect(await showAd("interstitial")).toEqual({ rewarded: false });
  expect(Object.keys(listeners)).toEqual([]); // cleaned up after the ad
});

test("on the web nothing is shown", async () => {
  delete window.Capacitor;
  await expect(showAd("interstitial")).rejects.toThrow();
});

// --- pacing ------------------------------------------------------------------

test("an interstitial is due only after enough rounds and enough time", () => {
  noteAdShown(0);
  for (let i = 1; i < ROUNDS_PER_INTERSTITIAL; i += 1) noteRoundFinished();
  expect(interstitialDue(MIN_GAP_MS)).toBe(false);
  noteRoundFinished();
  expect(interstitialDue(MIN_GAP_MS - 1)).toBe(false);
  expect(interstitialDue(MIN_GAP_MS)).toBe(true);
});

test("a break with no ad due goes straight on, inside the same tap", () => {
  const next = jest.fn();
  afterBreak(next)();
  expect(next).toHaveBeenCalled();
  expect(admob.showInterstitial).not.toHaveBeenCalled();
});

test("a due interstitial plays at the break, then the game carries on", async () => {
  noteAdShown(Date.now() - MIN_GAP_MS);
  for (let i = 0; i < ROUNDS_PER_INTERSTITIAL; i += 1) noteRoundFinished();
  const next = jest.fn();
  await afterBreak(next)();
  expect(admob.showInterstitial).toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
  expect(interstitialDue()).toBe(false);
});

test("a failed interstitial never blocks the next round", async () => {
  outcome = "failed";
  noteAdShown(Date.now() - MIN_GAP_MS);
  for (let i = 0; i < ROUNDS_PER_INTERSTITIAL; i += 1) noteRoundFinished();
  const next = jest.fn();
  await afterBreak(next)();
  expect(next).toHaveBeenCalled();
});

test("double points is offered now and then, and only for scored modes", () => {
  const offers = Array.from({ length: BOOST_EVERY_STARTS * 2 }, () => shouldOfferBoost("cipher"));
  expect(offers.filter(Boolean)).toHaveLength(2);
  expect(Array.from({ length: 10 }, () => shouldOfferBoost("rush")).some(Boolean)).toBe(false);
});

// --- rewards -----------------------------------------------------------------

test("a watched video returns the reward once the server confirms it", async () => {
  api.post.mockResolvedValue({ data: { reward_id: "r1", user_id: "u1" } });
  api.get.mockResolvedValueOnce({ data: { status: "pending" } }).mockResolvedValueOnce({ data: { status: "earned" } });
  await expect(earnReward("hint", "round-1", { pollMs: 1 })).resolves.toBe("r1");
  expect(api.post).toHaveBeenCalledWith("/ads/rewards", { kind: "hint", round_id: "round-1" });
  expect(admob.prepareRewardVideoAd).toHaveBeenCalledWith(
    expect.objectContaining({ npa: true, ssv: { userId: "u1", customData: "r1" } }),
  );
});

test("boosts use the rewarded interstitial unit", async () => {
  api.post.mockResolvedValue({ data: { reward_id: "r2", user_id: "u1" } });
  api.get.mockResolvedValue({ data: { status: "earned" } });
  await earnReward("boost", null, { pollMs: 1 });
  expect(admob.prepareRewardInterstitialAd).toHaveBeenCalledWith(
    expect.objectContaining({ adId: AD_UNITS.android.rewardedInterstitial }),
  );
});

test("closing the video early earns nothing", async () => {
  outcome = "closed";
  api.post.mockResolvedValue({ data: { reward_id: "r3", user_id: "u1" } });
  await expect(earnReward("hint", "round-1", { pollMs: 1 })).rejects.toThrow(RewardError);
  expect(api.get).not.toHaveBeenCalled();
});

test("a reward the server never confirms is reported, not granted", async () => {
  api.post.mockResolvedValue({ data: { reward_id: "r4", user_id: "u1" } });
  api.get.mockResolvedValue({ data: { status: "pending" } });
  await expect(earnReward("continue", "round-1", { pollMs: 1, pollForMs: 20 })).rejects.toThrow(/confirm/);
});

test("a rewarded video holds off the next interstitial", async () => {
  for (let i = 0; i < ROUNDS_PER_INTERSTITIAL; i += 1) noteRoundFinished();
  api.post.mockResolvedValue({ data: { reward_id: "r5", user_id: "u1" } });
  api.get.mockResolvedValue({ data: { status: "earned" } });
  await earnReward("hint", "round-1", { pollMs: 1 });
  expect(interstitialDue()).toBe(false);
});
