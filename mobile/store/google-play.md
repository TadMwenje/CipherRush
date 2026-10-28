# Google Play Console: CipherRush

What to enter in Play Console. The answers match the privacy policy
(`AximoIX-website-main/src/components/PrivacyPolicy.jsx`, section 12). If the
app's data use changes, update the policy first, then this file, then the
Data Safety form.

## Create app

| Field | Value |
| --- | --- |
| App name | CipherRush |
| Default language | English (United States) - en-US |
| App or game | Game |
| Free or paid | Free (this can't be changed to paid later) |
| Declarations | Developer Program Policies and US export laws: **you tick these yourself** |

The package name comes from the first upload: `com.aximoix.cipherrush`.

## Store listing

**Short description** (80 characters max)

> Crack ciphers, decode bytes and spot scams. Real security skills, arcade pace.

**Full description**

> CipherRush is a fast cybersecurity puzzle game. Crack classical ciphers, turn raw bytes back into words and call out scams before the clock runs out. The security lessons are real. It plays like an arcade game.
>
> SEVEN MODES AND A DAILY CHALLENGE
> • Cipher Puzzles: crack Caesar, Atbash and Vigenère against the clock
> • Speed Cipher Rush: decode as many words as you can in 90 seconds and build a combo
> • Binary / Hex: read bytes in real-world notation: padded binary, 0x, \x and %-encoding
> • Security Quiz: five questions per round, with an explanation for every answer
> • True or False: ten security claims per round. Swipe or tap
> • Match-3: swap security tiles to hit the target before you run out of moves
> • Memory Lock: flip and match pairs, from 8 to 24 cards
> • Daily Cipher: one cipher a day, the same for everyone, one attempt
>
> COMPETE
> Three leaderboards: all-time score, best Rush run and today's fastest Daily solve. Level up each mode, unlock 14 achievements and keep your Daily streak going.
>
> PRACTICE OFFLINE
> Practice Mode works with no account and no connection. It's unscored, so warm up as much as you like.
>
> FAIR BY DESIGN
> Every round is scored on our servers, so the leaderboards stay honest.
>
> No ads. No trackers. Reminders are opt-in and never go off at night.
>
> Made by AximoIX.

| Field | Value |
| --- | --- |
| Category | Game → Puzzle |
| Tags | Puzzle, Brain games, Educational (pick whichever Play offers) |
| Contact email | hello@aximoix.com |
| Website | https://aximoix.com |
| Privacy policy | https://aximoix.com/privacy/#cipherrush |

**Graphics** (`mobile/store/assets/`):
- App icon: `icon-512.png`, 512×512 PNG, opaque. Rendered from `mobile/assets/icon-only.svg`.
- Feature graphic: `feature-graphic-1024x500.png`.
- Phone screenshots: `phone-1-welcome.png` and `phone-2-practice.png`, 1080×2160
  (Play's 2:1 maximum), taken on a Galaxy SM-E135F with the status bar cropped
  off. That's the 2 Play requires. Better ones to add later: a Cipher puzzle
  mid-solve, Rush with a combo, and the leaderboard. Crop new captures the same
  way: `sips -c 2160 1080 --cropOffset 130 0 file.png`.

## App content

**Privacy policy:** https://aximoix.com/privacy/#cipherrush

**Ads:** No, the app doesn't contain ads.

**App access:** Most features need an account. Practice Mode is the only part that works signed out. Give reviewers the `play_review` account: provision it, then paste the reviewer instructions as described in `mobile/store/reviewer-access.md`. Its password goes **only** in this form.

**Target audience:** 13-15, 16-17 and 18+ (the policy says 13 and older). Don't select under-13 groups. Answer "No" to "unintentionally appealing to children" unless Play's questionnaire suggests otherwise.

**Content rating (IARC questionnaire):** category Game / Puzzle. Expected answers: no violence, no sexual content, no profanity, no drugs, no gambling and no simulated gambling. "Users can interact": **Yes**, because public leaderboards show usernames. There's no chat. Doesn't share location. No digital purchases yet: hints cost in-game points, not money. Expected rating: Everyone / PEGI 3, possibly with an "Users Interact" note.

**Account deletion** (required because users can create accounts):
- In the app: Profile → Delete account (deletes immediately).
- Web URL: https://aximoix.com/privacy/#cipherrush-delete

**Government app / financial features / health / news:** No to all.

## Data Safety

Encrypted in transit: **Yes** (the API is HTTPS only; Cloudflare with Full (strict) TLS).
Users can request deletion: **Yes** (see above).
Data collected and shared for advertising or tracking: **None**.

"Shared" in Play's sense excludes service providers acting for you (Render, Cloudflare, and Zoho ZeptoMail, which delivers the verification and password-reset emails) and transfers the user starts themselves (Google and Apple sign-in). So the answer is **No data shared**.

| Data type (Play category) | Collected | Required? | Purposes |
| --- | --- | --- | --- |
| Personal info → Email address | Yes | Required | App functionality, Account management, Developer communications (the confirmation code and password-reset emails only), Fraud prevention / security |
| Personal info → Name | Yes (only if shared through Google or Apple sign-in; used to suggest the starting username) | Optional | Account management |
| Personal info → User IDs | Yes (account ID, Google or Apple subject ID) | Required | App functionality, Account management, Fraud prevention / security |
| App activity → App interactions | Yes (rounds played, answers, scores) | Required | App functionality, Fraud prevention / security, Analytics (aggregate balancing only) |
| App activity → Other user-generated content | Yes (username shown on leaderboards) | Required | App functionality |
| App info and performance → Diagnostics | Yes (server request logs) | Required | Fraud prevention / security, App functionality |
| Device or other IDs | **No** (IP addresses aren't a Play data type; no advertising ID) | | |

Not collected: location, contacts, photos, files, audio, calendar, messages, health, financial info and web browsing.

Every collected item is processed ephemerally? **No**. It's stored on the server.

## Release: Internal testing first

1. Testing → Internal testing → Create new release.
2. Opt in to **Play App Signing** (Google holds the app signing key; ours is the upload key).
3. Upload `mobile/android/app/build/outputs/bundle/release/app-release.aab`.
   - Upload key SHA-256: `FA:61:F6:3C:BD:5D:D9:9E:9F:AA:88:9C:46:D0:29:30:68:2B:85:0B:2E:DA:D5:C3:CF:21:61:5C:87:BB:4E:06`
4. Release name `1.0.0 (1)`. Notes: "First internal build."
5. Add testers (an email list) and share the opt-in link.

Each new upload needs a higher `versionCode` in `mobile/android/app/build.gradle`.

**Rebuild the bundle:**

```sh
cd mobile && npm run sync
cd android && JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew bundleRelease
```

## Signing certificates for Google sign-in

Google sign-in on Android checks the certificate that signed the installed app,
so the Android OAuth client in Google Cloud (project `cipherrush-auth`, package
`com.aximoix.cipherrush`) needs every certificate that installs can come from.
Create one Android client per SHA-1:

| Certificate | Used by | SHA-1 |
| --- | --- | --- |
| Play app signing key | Every install from Google Play, including internal testing | Copy it from Play Console → Test and release → App integrity → App signing (it exists after the first upload) |
| Upload key (`~/.cipherrush-signing/`) | Release builds sideloaded with `adb install` | `2D:4D:EF:E4:FD:74:E3:44:F4:CD:A3:83:F5:75:B0:63:E1:61:80:21` |
| This Mac's debug key (`~/.android/debug.keystore`) | `app-debug.apk` | `64:D3:D4:68:41:95:DE:69:B2:92:50:F8:8C:08:57:D2:F7:15:93:8A` |

Upload key SHA-256: `FA:61:F6:3C:BD:5D:D9:9E:9F:AA:88:9C:46:D0:29:30:68:2B:85:0B:2E:DA:D5:C3:CF:21:61:5C:87:BB:4E:06`.

Android also needs a **Web application** OAuth client in the same project. Its
client ID goes in two places:
- `REACT_APP_GOOGLE_WEB_CLIENT_ID` in `frontend/.env.production`. It's a public
  identifier, not a secret.
- Appended to `GOOGLE_CLIENT_IDS` in `render.yaml`, comma-separated after the iOS
  ID. That makes it a valid server audience.

The app signs in with native ID tokens, so no redirect URIs are needed and the
API has no `/auth/google/callback`. Until the Web client exists, Android hides
the Google button and offers email and password only. Sign in with Apple is
iOS (and web) only, by design.

New personal developer accounts need a closed test with at least 12 testers for 14 days before production access.
