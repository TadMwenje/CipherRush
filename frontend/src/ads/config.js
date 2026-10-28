/*
 * AdMob ad units for CipherRush, per platform. App IDs live in the native
 * projects (AndroidManifest.xml, Info.plist); these are the ad unit IDs.
 *
 * Live ads only in release builds: `npm run sync:release` in mobile/ sets
 * REACT_APP_ADMOB_MODE=live. Anything else is a test build, which must never
 * show real ads to the people building it (AdMob bans accounts for that):
 *   - with REACT_APP_ADMOB_TEST_DEVICES set (comma-separated device ids from
 *     logcat / Xcode), our real units are used but those devices get test ads,
 *     and server-side reward verification still runs end to end;
 *   - otherwise Google's sample units are used. Ads show, but Google never
 *     calls our server for them, so rewards can't be granted.
 */
export const AD_UNITS = {
  android: {
    rewarded: "ca-app-pub-4454014752754466/1864983028",
    interstitial: "ca-app-pub-4454014752754466/6710115593",
    rewardedInterstitial: "ca-app-pub-4454014752754466/9823364092",
  },
  ios: {
    rewarded: "ca-app-pub-4454014752754466/1344227940",
    interstitial: "ca-app-pub-4454014752754466/6518543900",
    rewardedInterstitial: "ca-app-pub-4454014752754466/9031146273",
  },
};

export const LIVE = process.env.REACT_APP_ADMOB_MODE === "live";

export const TEST_DEVICES = (process.env.REACT_APP_ADMOB_TEST_DEVICES || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/** Options for every ad request: always non-personalised, never live in test builds. */
export function adRequest(platform, format, extra = {}) {
  const adId = AD_UNITS[platform]?.[format];
  return { adId, npa: true, isTesting: !LIVE && TEST_DEVICES.length === 0, ...extra };
}
