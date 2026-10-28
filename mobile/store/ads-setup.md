# Ads: setup outside the code

The app shows Google AdMob ads (code in `frontend/src/ads/`, rewards checked in
`backend/ads.py`). These steps happen in consoles and on the website.

## 1. AdMob console: server-side verification (required for rewards)

Rewards are only granted when Google's signed callback reaches our server. For
each of these four ad units, open the unit → **Server-side verification** →
set the callback URL to `https://api.aximoix.com/api/ads/ssv` and save:

| Unit | Android | iOS |
| --- | --- | --- |
| Rewarded | …/1864983028 | …/1344227940 |
| Rewarded interstitial | …/9823364092 | …/9031146273 |

Use **Verify URL** in that dialog. It should pass: Google's test call is
signed, and our server answers 200 without granting anything, since it has
no reward ID. A failure or a Cloudflare block page means Bot Fight Mode (or a
WAF rule) is stopping Google: add a skip rule for the path `/api/ads/ssv`.
The backend must be deployed first.

## 2. Test devices (before anyone on the team plays a build with ads)

Never tap live ads on your own phone; AdMob can suspend the account for it.

1. Run a debug build. Find the device ID in the log:
   - Android: in `adb logcat`, a line with `setTestDeviceIds(Arrays.asList("…"))`.
   - iOS: in the Xcode console, a line with `GADMobileAds.sharedInstance.requestConfiguration.testDeviceIdentifiers`.
2. Add it in AdMob → Settings → **Test devices** as well.
3. Build with it so the app asks for test ads on our real units, which
   lets server-side verification run end to end:
   `REACT_APP_ADMOB_TEST_DEVICES=<id> npm run sync`

With no test device configured, debug builds use Google's sample ads. Those
show, but Google never calls our server for them, so a "free hint" or "+5
moves" ends with "Couldn't confirm the reward". That's expected.

Release builds: `npm run sync:release` (sets `REACT_APP_ADMOB_MODE=live`),
then build the AAB or archive in Xcode as usual.

## 3. app-ads.txt

Put a file at `https://aximoix.com/app-ads.txt` (the site root, exactly the
developer website listed on Play and the App Store) with this line:

```
google.com, pub-4454014752754466, DIRECT, f08c47fec0942fa0
```

AdMob → Apps → app-ads.txt then shows it as verified. This can take a day
or so. Until then, ad fill may be limited.

## 4. Google Play

Set out in `google-play.md`: App content → Ads **Yes**, the Advertising ID
declaration, and the updated Data Safety rows.

## 5. App Store privacy label (App Store Connect → App Privacy)

Data used to track you: **None** (non-personalised ads, no ATT prompt).
Add these data types, each **Not linked to the user**, **not used for
tracking**, purposes **Third-Party Advertising** and **Analytics**:

- Identifiers → Device ID
- Usage Data → Advertising Data, Product Interaction
- Diagnostics → Crash Data, Performance Data
- Location → Coarse Location

Keep the existing account rows (email, user ID, gameplay) as they are.
Apple's age rating questionnaire also asks about ads: answer that the app
contains ads.

## 6. Privacy policy

Paste the AdMob sections from `privacy-policy-email-update.md`.
