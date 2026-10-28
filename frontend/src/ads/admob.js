/*
 * Google AdMob through @capacitor-community/admob (installed in mobile/).
 * Native app only: on the web every call is a no-op and adsAvailable() is false.
 *
 * Every ad is non-personalised (npa), and nothing loads until Google's consent
 * flow (UMP) has run - it shows the consent form only where the law asks for
 * it (EEA, UK, Switzerland). Each show() removes its own listeners afterwards.
 */
import { LIVE, TEST_DEVICES, adRequest } from "./config";

function plugin() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return cap?.isNativePlatform?.() ? cap.Plugins?.AdMob || null : null;
}

function platformName() {
  return window.Capacitor?.getPlatform?.() || "web";
}

let ready = null;
let canRequestAds = false;
let privacyRequired = false;

/** Initialise once and run the consent flow. Safe to call often. */
export function initAds() {
  const admob = plugin();
  if (!admob) return Promise.resolve(false);
  if (!ready) {
    ready = (async () => {
      await admob.initialize({
        initializeForTesting: !LIVE && TEST_DEVICES.length > 0,
        testingDevices: TEST_DEVICES,
      });
      let info = await admob.requestConsentInfo();
      if (!info.canRequestAds && info.isConsentFormAvailable && info.status === "REQUIRED") {
        info = await admob.showConsentForm();
      }
      canRequestAds = !!info.canRequestAds;
      privacyRequired = info.privacyOptionsRequirementStatus === "REQUIRED";
      return canRequestAds;
    })().catch(() => {
      ready = null; // try again next time (no signal, say)
      return false;
    });
  }
  return ready;
}

export function adsAvailable() {
  return !!plugin();
}

/** Whether Google says this player needs a way back to the consent form (consent regions). */
export async function privacyOptionsRequired() {
  await initAds();
  return privacyRequired;
}

/** Lets players in consent regions change their choice (Profile -> Account). */
export async function showPrivacyOptions() {
  const admob = plugin();
  if (!admob) return;
  await initAds();
  await admob.showPrivacyOptionsForm();
}

const EVENTS = {
  interstitial: { dismissed: "interstitialAdDismissed", failed: "interstitialAdFailedToShow" },
  rewarded: {
    dismissed: "onRewardedVideoAdDismissed",
    failed: "onRewardedVideoAdFailedToShow",
    rewarded: "onRewardedVideoAdReward",
  },
  rewardedInterstitial: {
    dismissed: "onRewardedInterstitialAdDismissed",
    failed: "onRewardedInterstitialAdFailedToShow",
    rewarded: "onRewardedInterstitialAdReward",
  },
};

const LOADERS = {
  interstitial: ["prepareInterstitial", "showInterstitial"],
  rewarded: ["prepareRewardVideoAd", "showRewardVideoAd"],
  rewardedInterstitial: ["prepareRewardInterstitialAd", "showRewardInterstitialAd"],
};

/**
 * Load and show one ad, resolving when it's closed with { rewarded }.
 * Rejects if ads can't run here (web, no consent, no fill, no signal).
 */
export async function showAd(format, extra = {}) {
  const admob = plugin();
  if (!admob || !(await initAds())) throw new Error("Ads aren't available right now.");
  const names = EVENTS[format];
  const handles = [];
  let rewarded = false;
  const cleanup = () => handles.forEach((h) => h.then((handle) => handle?.remove?.()).catch(() => {}));
  try {
    const closed = new Promise((resolve, reject) => {
      handles.push(Promise.resolve(admob.addListener(names.dismissed, () => resolve())));
      handles.push(Promise.resolve(admob.addListener(names.failed, () => reject(new Error("The ad couldn't play.")))));
      if (names.rewarded) {
        handles.push(Promise.resolve(admob.addListener(names.rewarded, () => (rewarded = true))));
      }
    });
    const [prepare, show] = LOADERS[format];
    await admob[prepare](adRequest(platformName(), format, extra));
    await admob[show]();
    await closed;
    return { rewarded };
  } finally {
    cleanup();
  }
}
