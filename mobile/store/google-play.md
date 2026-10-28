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

**Graphics still needed:**
- App icon: 512×512 PNG, 32-bit, max 1 MB. Export from `mobile/assets/icon-only.svg`.
- Feature graphic: 1024×500 PNG or JPG.
- At least 2 phone screenshots (16:9 or 9:16, 320-3840 px per side). Take them on a real device.

## App content

**Privacy policy:** https://aximoix.com/privacy/#cipherrush

**Ads:** No, the app doesn't contain ads.

**App access:** Most features need an account. Practice Mode is the only part that works signed out. Give reviewers a dedicated review account. Create it on the live app yourself and enter its username and password **only** in this form.

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

"Shared" in Play's sense excludes service providers acting for you (Render and Cloudflare) and transfers the user starts themselves (Google and Apple sign-in). So the answer is **No data shared**.

| Data type (Play category) | Collected | Required? | Purposes |
| --- | --- | --- | --- |
| Personal info → Email address | Yes | Required | App functionality, Account management |
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

**After Play App Signing is on**, copy the *app signing key* SHA-1 and SHA-256 from Setup → App signing. Google sign-in on Android needs them:
- for the Android OAuth client in Google Cloud;
- for the Web client ID that the app passes as `serverClientId`. That client doesn't exist yet.

New personal developer accounts need a closed test with at least 12 testers for 14 days before production access.
