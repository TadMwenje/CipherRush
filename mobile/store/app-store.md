# App Store Connect: CipherRush (iOS)

Paste-ready answers for App Store Connect. The listing copy matches
`google-play.md`.

## Create the app (Apps → + → New App)

| Field | Value |
| --- | --- |
| Platform | iOS |
| Name | CipherRush |
| Primary language | English (U.K.) (same as the Play listing) |
| Bundle ID | `com.aximoix.cipherrush` (listed as "XC com aximoix cipherrush"; Xcode registered it) |
| SKU | `cipherrush-ios` |
| User access | Full Access |

## Upload a build

The build number has to go up with every upload (Xcode → App target → General
→ Build, or `CURRENT_PROJECT_VERSION`). The marketing version stays 1.0.0
until release.

1. `cd mobile && npm run sync:release`. This sets live ads; never upload a
   test-mode build.
2. Xcode → Product → Archive (scheme App, "Any iOS Device"), or
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath <path> -allowProvisioningUpdates archive`.
3. Window → Organizer → the archive → **Distribute App** → App Store Connect
   → Upload.

Export compliance is answered in `Info.plist`
(`ITSAppUsesNonExemptEncryption` = NO: HTTPS only), so builds skip that
question.

## App information

| Field | Value |
| --- | --- |
| Subtitle (30 max) | Crack ciphers. Spot scams. |
| Category | Games → Puzzle; secondary: Education |
| Privacy policy URL | https://aximoix.com/privacy/#cipherrush |
| Support URL | https://aximoix.com |
| Marketing URL | (leave empty) |
| Copyright | 2026 AximoIX |
| Content rights | Doesn't contain third-party content |

**Keywords** (100 max; this is 99, comma-separated, no spaces after commas)

```
cipher,cryptography,cybersecurity,code breaker,decode,caesar,binary,hex,phishing,quiz,match 3,brain
```

**Promotional text** (170 max)

> Crack ciphers, decode bytes and spot scams against the clock. Seven modes,
> a Daily Cipher and honest leaderboards.

**Description:** the full description from `google-play.md` → Store listing,
as is.

## Screenshots (`mobile/store/assets/`)

Every image is a real capture of the app (guideline 2.3.3), saved as a
24-bit PNG with no alpha. Raw captures are in `assets/raw/`; regenerate with
`node mobile/scripts/ios-store-assets.mjs framed …` (see the script header).

**iPhone 6.9" slot (1290×2796)**, upload in this order:

1. `ios-iphone-1-cipher.png`: "Beat the clock" (a scored Cipher round, simulator)
2. `ios-iphone-2-match3.png`: "Match-3, security style"
3. `ios-iphone-3-truefalse.png`: "Spot the myths"
4. `ios-iphone-4-practice.png`: "Practise offline"
5. `ios-iphone-5-welcome.png`: "Real skills, fast"

1290×2796 is one of the sizes the 6.9" slot accepts (alongside 1260×2736
and 1320×2868), and App Store Connect scales it down for smaller iPhones.
If an upload is refused, check you dropped it in the iPhone slot, not iPad.

**Search results:** there's no separate search-results asset. A search
result shows the icon, name, subtitle and the **first three screenshots**
(or an app preview video). That's why the order above puts Cipher, Match-3
and True/False first.

**iPad 13" (2048×2732):** `ios-ipad13-2048x2732.png` (Match-3 practice,
simulator). **iPad 11" (1640×2360)**, optional: `ios-ipad11-1640x2360.png`
(the dashboard).

**App Store header (5244×2950):** `ios-header-5244x2950.png`.

## Age rating

Answer **None** to every content question. "Unrestricted web access": No.
"Contains ads": **Yes**. Users can see each other's usernames on
leaderboards, but there's no chat. Expected result: 4+ (or 9+ if Apple
counts the ads).

## App Privacy (the nutrition label)

**Tracking: No.** Every ad request is non-personalised, the app never shows
the App Tracking Transparency prompt, and no data is linked with other
companies' data for advertising. Without ATT permission, iOS gives AdMob no
advertising identifier.

Data types to add:

| Apple data type | Linked to the user? | Tracking | Purposes |
| --- | --- | --- | --- |
| Contact Info → Email Address | Yes | No | App Functionality |
| Contact Info → Name (only if shared through Apple or Google sign-in) | Yes | No | App Functionality |
| Identifiers → User ID | Yes | No | App Functionality |
| Usage Data → Product Interaction (rounds, answers, scores) | Yes | No | App Functionality, Analytics |
| User Content → Other User Content (the username shown on leaderboards) | Yes | No | App Functionality |
| Identifiers → Device ID (AdMob) | No | No | Third-Party Advertising, Analytics |
| Usage Data → Advertising Data (AdMob) | No | No | Third-Party Advertising, Analytics |
| Location → Coarse Location (AdMob, from the IP address) | No | No | Third-Party Advertising, Analytics |
| Diagnostics → Crash Data, Performance Data (AdMob SDK) | No | No | Analytics |

The directive suggested a narrower label. It would leave out what Google's
AdMob SDK collects on iOS (coarse location, advertising data, product
interaction), and Apple rejects apps whose label doesn't match the SDKs
they ship. "Non-personalised ad analytics" isn't one of Apple's purposes;
the AdMob rows use Third-Party Advertising and Analytics.

## App Review information

Sign-in: the `appstore_review` account (see `reviewer-access.md`; its
password goes only into App Store Connect). Notes: "Sign in with the account
above, or tap Practice for the offline mode. Rewarded videos (free hint, extra
moves, double points) are optional; a short interstitial can appear between
rounds."

## TestFlight

- **Internal testing** (members of your App Store Connect team): TestFlight →
  Internal Testing → + → group "CipherRush QA Testers" → add testers → add
  the build. No review needed; available minutes after processing.
- **External testing** (anyone, by email or public link): TestFlight →
  External Testing → + → group → add the build → answer the Test Information
  (feedback email, beta description, the review sign-in above) → Submit for
  Beta App Review. The first build of an app is reviewed, usually within a
  day. After approval, Group → Public Link → Enable to get the
  `https://testflight.apple.com/join/…` link.
