# CipherRush: Project State

Single source of truth for what CipherRush is, how it's built, what has been done, what's still open, and what comes next.

| | |
| --- | --- |
| **Last updated** | 2026-11-23 |
| **Branch** | `v1.0.2` (local only, not pushed; branched from `v1.0.1`). `v1.0.1` is pushed and is what Render deploys via `ios-device-testing` |
| **Test status** | 276 backend tests · 284 frontend tests · strict production build clean (2026-11-23, branch `v1.0.2`) |
| **Native builds** | iOS 1.0 (3) Ready for Distribution; iOS 1.0.1 (4) Waiting for Review (2026-11-23) · Android 1.0.0 (5) live on Closed testing - Alpha; 1.0.1 (6) live on Alpha; 1.0.2 (7) / iOS 1.0.2 (5) prepared locally, not built or uploaded; production access application under review |
| **Publisher** | AximoIX. Bundle/package ID `com.aximoix.cipherrush`. Legal terms: [aximoix.com/terms](https://aximoix.com/terms/#cipherrush) and [aximoix.com/privacy](https://aximoix.com/privacy/#cipherrush) |

---

## 1. Project executive overview

### 1.1 Game identity and concept

CipherRush is a fast, mobile-first cybersecurity puzzle game for iOS and Android. Players crack classical ciphers, decode raw bytes, spot scams and race the clock. The security lessons are real, and it plays like an arcade game.

There are seven game modes plus a daily challenge:

| Mode | Key | What you do |
| --- | --- | --- |
| Cipher Puzzles | `cipher` | Crack Caesar, Atbash or Vigenère ciphertext against a clock, with optional paid hints |
| Speed Cipher Rush | `rush` | Decode as many short words as possible in 90 seconds; consecutive solves build a combo multiplier |
| Binary / Hex | `binhex` | Turn ASCII bytes back into words, written in real-world notation (padded and 7-bit binary, nibbles, `0x`, `\x`, `%`-encoding, packed hex) |
| Security Quiz | `quiz` | Five questions per round from one of five topics, with an explanation for every answer |
| True or False | `truefalse` | Ten claims per round (always 5 true, 5 false); swipe or tap |
| Match-3 | `match3` | Swap security-icon tiles on a 6×6 board to hit a target within a move budget |
| Memory Lock | `memory` | Flip-and-match pairs, 8 to 24 cards |
| Daily Cipher | `daily` | One server-chosen cipher per UTC day, the same for every player, one attempt |

### 1.2 Target audience and experience goals

- **Players:** cybersecurity enthusiasts, casual puzzle players, and students learning security basics.
- **Tone:** dry, direct, player-to-player, with hacker and arcade vocabulary ("Cracked.", "Not it.", "Out of moves."). No marketing filler and no "unleash your inner hacker". Loading states are plain ("Loading board").
- **Visual identity:** deep navy (`#0A0E1A`) with electric cyan (`#00E5FF`) and violet (`#7C4DFF`). Custom angular glyph icons and a cipher-rotor brand mark with a `>_` prompt, not stock icons or glossy padlocks.
- **Competitive loops:** three leaderboards (all-time score, best Rush run, today's fastest Daily solve), per-mode level tracks, 14 achievements, and a Daily Cipher streak.

### 1.3 Technology stack

| Layer | Technology | Notes |
| --- | --- | --- |
| **Frontend** | React 19, Create React App (`react-scripts` 5) via CRACO, React Router 7, Axios | Not Vite. Glassmorphism panels (backdrop blur) over an SVG cyberpunk backdrop |
| Mobile UI layer | `frontend/src/mobile/` | Viewport and keyboard tracking (`visualViewport`), monotonic and server clocks, swipe/drag helpers, haptics, touch audit |
| Icons | `frontend/src/glyphs/` | Bespoke SVG glyph set (lucide-react no longer used) |
| **Backend** | FastAPI (Python 3.9 venv), asyncpg, Pydantic 2 | Server-authoritative rounds; strict request models reject unknown fields |
| Database | PostgreSQL 14+ | Schema applied on startup; one-off data migrations tracked in `schema_migrations` |
| Auth | bcrypt (cost 12), PyJWT HS256 in `httpOnly` cookies | 15-minute access token plus rotating 30-day refresh token |
| Social sign-in | Google (`google-auth`), Apple (PyJWT + Apple JWKS) | Server-side ID token verification with a strict audience check; `@capgo/capacitor-social-login` in the native apps |
| Abuse controls | slowapi rate limits, CSRF header guard, CORS allow-list, security headers | |
| **Native shells** | Capacitor 8 (`mobile/`) | iOS via Swift Package Manager, Android via Gradle; CapacitorHttp and CapacitorCookies enabled |
| **Infrastructure** | `docker-compose.yml` | **Database only** for now. The API and web app aren't containerised yet (§4) |
| **Testing** | pytest + FastAPI TestClient; Jest (CRA) | Plus a dev-only device lab for visual and touch audits |

---

## 2. Architectural evolution and completed milestones

### 2.0 Starting point (evaluation, 2026-10-20)

The VORA evaluation scored the original build **4.7 / 10**. Every score was calculated in the browser and trusted by the server. Six forged requests took a new account to level 14 and 20,800 points, above the real #1 player. The Security Quiz always scored 0%. There were only 5 fixed cipher sentences and 6 quiz questions in total, and no authentication beyond a `user_id` field.

### 2.1 Phase 0: security and trust (complete)

- **No client-supplied identity.** Every `/api/user/{user_id}/…` endpoint was removed. The acting user always comes from a verified session token (`auth.get_current_user`). Profile data, including email, is visible only to its owner (`/api/me/*`).
- **Server-authoritative rounds.** A new `game_rounds` table holds each round's secret state (answers, deck order, RNG seed, live progress) as JSONB. The client sends only raw input (an answer, a swap, a card index). The server validates it, computes the score, and completes the round exactly once (`completed_at`). Replaying a finished round returns 409.
- **Answers hidden.** Plaintext, shift, key, quiz answer keys and true/false truths are never sent to the client before an answer is committed.
- **Strict inputs.** Every request model is `extra="forbid"`, so fields like `score`, `level`, `user_id` or `original_questions` are rejected with 400.
- **Passwords and sessions:**
  - bcrypt cost 12.
  - Failed logins take the same time whether or not the username exists, so usernames can't be discovered by timing.
  - Signed JWT in an `httpOnly` cookie.
  - Logout revokes every session by bumping `users.session_version`.
- **Abuse controls:**
  - Rate limits: register 5/min, login 10/min, round starts 30/min, round actions 240/min; over the limit returns 429.
  - Every POST must carry an `X-Requested-With: CipherRush` header (CSRF guard).
  - CORS is limited to an allow-list of origins.
  - Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Quiz 0% bug fixed.** The root cause was the client sending answer-stripped questions back as the answer key; grading is now server-only.

### 2.2 Phase 1: gameplay refinement (complete)

- **Procedural ciphers:** random plaintext from the phrase bank, random Caesar shift (1–25), Vigenère keys tiered by level, and no repeat of the player's last 40 plaintexts.
- **Cipher tools:**
  - A draggable Caesar wheel.
  - An Atbash mirror alphabet.
  - A Vigenère key-length view that colours each letter by its key position.
  - Paid hints that cost 20% of base each.
- **Feedback loops:**
  - Every quiz answer gets an explanation on the results screen.
  - True or False and Binary/Hex give per-item feedback as each answer is graded by the server.
  - True or False has streak tracking.
- **Match-3:** a 6×6 board with gravity and refill. Cascades are resolved on the server and animated step by step on the client. An idle hint appears after 7 seconds, dead boards reshuffle automatically, and you can swipe or tap-tap.
- **Memory Lock:** the deck stays on the server and each flip reveals one card. The card back is a distinct circuit pattern, input pauses visibly while a missed pair flips back, and grids are always full.
- **Onboarding:**
  - The splash shows once per session and has a working exit (it previously never finished).
  - "How it works" shows real rules.
  - Sign-up logs you straight in.
  - The game clock starts only after the splash.

### 2.3 Phase 2: modes and visual theme (complete)

- **New modes:** Speed Cipher Rush (90 s, its own leaderboard), Binary/Hex Decoder (place-value explainer and ASCII table), and Atbash and Vigenère variants.
- **Renamed mode:** "Binary Decrypt" (really a true/false quiz) became **True or False**. A one-time data migration moved its sessions, progress and badge.
- **Visual theme:**
  - SVG cyberpunk backdrop on every screen: data streams, binary rain, circuit traces, glowing nodes.
  - It's static behind games for performance.
  - Glassmorphism cards throughout.
  - Two-column dashboard on desktop.

### 2.4 Phase 3: content, economy and mobile (complete)

**Content banks** (`backend/content/`):

| Bank | Size | Notes |
| --- | --- | --- |
| Cipher phrases | **270** | Tiers by word count: 102 short / 82 medium / 86 long. Security maxims and cipher history |
| Vigenère keys | 51 | Four tiers by length (3–4 → 10–12 letters), with multi-word keys at the top tier |
| Rush words | 99 | 3 to 8 letters |
| Security Quiz | **200** | 40 each: Phishing, Social Engineering, Cryptography, Malware, Incident Response; 4 options each |
| True or False | **204** | 131 true / 73 false. Rounds always deal 5 + 5 so the bank's lean can't be gamed |
| Binary / Hex | **50** | 10 real-world notations across 3 difficulty tiers |

**Economy** (`backend/economy.py`, the single home for every scoring number):

- **Logarithmic level scaling:** `level_factor = 1 + 0.5·ln(level)`, giving 1.0 at level 1, 2.15 at level 10 and 3.65 at level 200.
- **Tapered multipliers:** Rush combo, Match-3 cascade and True/False streak bonuses grow quickly at first, then level off at a hard ceiling (2.5×, 2.5× and 1.5×).
- **Per-round caps:** any score above the cap is clamped and logged. Level-1 caps: cipher 225, quiz 150, true/false 180, binary/hex 210, memory 300, Rush 1,200, Match-3 1,500, Daily 370.
- **Pass rules (anti-farming):** only *cleared* rounds count toward the 4 needed per level. Cleared means a correct answer; quiz ≥60%; true/false ≥70%; binary/hex ≥3 of 5; a Match-3 win; memory misses ≤ pairs; Rush solves ≥ a level-scaled target. Losing rounds still pay their small score.
- **Cross-mode gate:** from level 5, levelling also requires having played other modes.
- **Daily Cipher:**
  - The puzzle comes from an HMAC of the UTC date with a server secret.
  - One attempt per player per day, enforced by the database key.
  - Flat rewards with a streak bonus, and no level track.
  - Fastest-solve board.

**Mobile ergonomics:**

- Every tap target is at least 48dp. The Match-3 board can't drop below 48dp tiles.
- Safe-area insets (notch, Dynamic Island, gesture bars) through `viewport-fit=cover`.
- **Portrait and landscape:** in landscape, controls sit on the left, the playfield on the right, and the nav becomes a side rail. Memory Lock picks its grid shape from the available space.
- Swipe Match-3 tiles and True/False cards; drag the cipher wheel. Hover effects apply only to real pointers.
- Input text is at least 16px so iOS doesn't zoom.
- An unfinished round resumes after the app is killed (`GET /api/games/{mode}/rounds/active`).
- **Network resilience:**
  - Every game action carries an `X-Request-Id`, so a retry after a dropped connection returns the stored response instead of applying the move twice.
  - Silent token refresh, done once even when several requests fail together.
  - A connection banner shows while offline or retrying.
- **De-AI pass:** all copy rewritten in the dry, direct voice. About 40 stock icons replaced with the custom glyph set. The padlock brand mark and app icons replaced with the cipher rotor.

### 2.5 Phase 3.5: production hardening (complete)

| Item | Root cause | Fix |
| --- | --- | --- |
| **Match-3 freeze** ("Racking tiles…" forever) | A fresh round's start response didn't include the board. Resumed rounds did, which hid the bug in testing | Board added to the start payload. Response contract test for every mode. Cascades capped at 25 (then reshuffle). Board generation can't raise or loop. Error and retry instead of an endless loader. "Syncing" state on slow swaps |
| **Daily Cipher clock tampering** | No server time source for the client; a submitted round wasn't checked against the recorded attempt | `GET /api/time`. Client uses server time for the daily countdown and a monotonic clock for in-round timers. Submit must match that day's recorded attempt |
| **Mobile keyboard focus** | iOS only raises the keyboard for `focus()` inside a user gesture, and doesn't resize the layout for it | `primeKeyboard()` focuses a hidden input inside the tap, then hands focus to the real one. A global `visualViewport` tracker sets `--kb` / `--vvh` and scrolls the focused field and its submit button into view |
| **AI-style padlock iconography** | Glossy 3D padlock on the splash, welcome screen and app icons | `CipherMark` (rotor + `>_`) and regenerated PWA icons. Old icons were saved to a session scratch folder, which is temporary |
| **Log out hidden behind the bottom nav** | A keyboard CSS rule overrode the pages' nav clearance | Clearance restored. The device lab now flags "covered" controls, and a CSS contract test protects the clearance |

### 2.6 Phase 4: native packaging (started)

- `mobile/` is a Capacitor 8 project that wraps `frontend/build`:
  - `mobile/ios` is an Xcode project using Swift Package Manager (no CocoaPods).
  - `mobile/android` is a Gradle project.
- CapacitorHttp and CapacitorCookies are enabled, so cookie sessions work inside the native shells.
- `@capacitor/haptics` is installed and used automatically by `haptics.js` (iOS Taptic Engine and Android haptics). The browser falls back to the Vibration API.
- **Development networking:**
  - iOS allows local-network HTTP (`NSAllowsLocalNetworking`).
  - Android allows cleartext to `10.0.2.2` / `localhost` in **debug builds only**.
  - Release builds are HTTPS-only.
- **Orientation:** portrait and both landscapes on phones, all four on iPad. On Android the WebView survives rotation.
- The backend CORS list includes `capacitor://localhost` and `https://localhost`.

### 2.7 Publisher alignment, social sign-in and legal (2026-10-21)

- **Namespace:** bundle and package ID `com.aximoix.cipherrush` on iOS and Android (Capacitor config, Xcode, Gradle, `MainActivity` package). Verified in the built APK.
- **Google / Apple sign-in:**
  - `POST /api/auth/google` and `POST /api/auth/apple` verify ID tokens server-side: signature, issuer, expiry, the **audience** must be in `GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS`, and an optional nonce.
  - A valid token creates or finds the account and issues the normal `httpOnly` session cookies. No client secrets are in the app.
  - Identities are stored in `user_identities`, keyed by the provider's stable ID.
  - **No silent merge** into an existing password account with the same email; the API returns 409 instead. This blocks account pre-hijacking, since password sign-ups don't verify email.
  - Apple's `.p8` key (server only) exchanges the authorization code and revokes Apple tokens on account deletion.
- **Account management:**
  - `POST /api/me/username` changes the handle.
  - `GET /api/me/account` shows the email and sign-in methods.
  - `POST /api/me/delete` requires `{"confirm":"DELETE"}`, revokes Apple tokens, and cascades every row. This is in-app account deletion as required by the App Store and Google Play.
  - The UI is in *Profile → Account*.
- **Legal:**
  - CipherRush uses AximoIX's terms and privacy policy, which now have CipherRush sections (aximoix.com repo, commit `8b63b43`). Covered: the 13+ age rule, fair play, public leaderboards, deletion, and the clauses Apple requires in a custom EULA.
  - The app links to them from the welcome screen, sign-up (consent line) and Profile, using the in-app browser in native builds.
- **Repos kept separate:** the AximoIX website lives in `AximoIX-website-main/` inside this folder but is its own git repo, and is ignored here.
- **Tests:** 21 new backend tests mint test-signed tokens covering valid sign-in, wrong audience, wrong issuer, expiry, bad signature, nonce mismatch, unverified email, the pre-hijack defence, username changes and full deletion with Apple revocation.

### 2.8 iOS release prep (2026-10-21, branch `ios-device-testing`)

- **Done:** `DEVELOPMENT_TEAM = T6KB43BH88` (the only team in the keychain), `MARKETING_VERSION 1.0.0`, `ITSAppUsesNonExemptEncryption = false`, `PrivacyInfo.xcprivacy` in the App target (email, user ID and gameplay data, linked, app functionality; no tracking; `UserDefaults` reason `CA92.1`, because the social-login plugin uses it and ships no manifest), icon and splash generated from `icon-source.svg` into `mobile/assets/` and `Assets.xcassets`.
- **Verified:** simulator build succeeds and launches; 87 backend tests, 40 frontend tests and the strict build pass.
- **Blocked on the user:** Xcode has no Apple ID account signed in ("No Accounts"), so device builds fail at provisioning. The iPhone also showed as offline. The sign-in matrix (B), device QA (C), light/dark icon check, the Release archive and the production HTTPS URL are **not done**.

---

### 2.9 Mobile reliability, reminders and Practice Mode (2026-10-28, branch `ios-device-testing`)

- **Freeze after switching apps:** CapacitorHttp ignores axios's `timeout` on native POSTs (iOS waits up to 10 minutes), so a request cut off by backgrounding hung its screen. `api.js` now enforces deadlines itself (`withDeadline`), offline waits are capped at 20 s, a dropped connection during `/auth/refresh` no longer signs the player out, and the session is refreshed up front after 10+ minutes away. Game timers re-anchor on the server clock on resume (`mobile/lifecycle.js`); Rush no longer sticks at 0:00 when its finish request fails. CSS animations and audio pause in the background.
- **Stuck "Reconnecting":** connectivity comes from the OS via `@capacitor/network` (`mobile/network.js`); the banner always clears when a request succeeds or gives up.
- **Black screens:** every route is wrapped in `ScreenBoundary` (retry / home), which logs `[CipherRush] screen crashed at <path>: <stack>` as one string for Xcode, Safari Web Inspector and Logcat. Versus, Ranks and Profile validate response shapes.
- **Data use:** no polling anywhere. Live screens fetch on open and refetch only on reconnect or resume while visible (`useRefetchOnReturn`); nothing is fetched offline.
- **Reminders:** opt-in local notifications (`@capacitor/local-notifications`, `notifications.js`): new Daily Cipher, "still open", "check your rank" after a solve, come-back at 24 h / 48 h. Quiet hours 22:00-09:00. Toggle in Profile, one-time card on the dashboard; an OS revoke cancels everything on the next resume. Android drops `SCHEDULE_EXACT_ALARM`.
- **Practice Mode (`/practice`):** unscored Caesar, Atbash and True/False generated on the phone from a local seed; no account or connection needed. About one item in five of the phrase and true/false banks is practice-only (`content.is_practice_item`, stable text hash) and excluded from scored rounds, so the bundled answers (`frontend/src/practice/bank.json`, generated by `backend/scripts/export_practice_bank.py`) give nothing away. Launching offline skips the session check and offers Practice; the session is checked on reconnect.
- **Release guard:** `npm run sync` refuses to bundle unless `REACT_APP_BACKEND_URL` is an HTTPS non-localhost origin (`frontend/scripts/check-backend-url.js`; `ALLOW_DEV_BACKEND=1` for simulator builds).
- **Production API:** `https://api.aximoix.com` (Render behind Cloudflare, proxied, SSL Full (strict); the backend reads the real client IP from `CF-Connecting-IP` when `TRUST_CF_CONNECTING_IP=true`). Release builds point there (`frontend/.env.production`). See O-15.
- **Android release signing:** release bundles are signed with the Play upload key. The keystore and `keystore.properties` live outside the repo in `~/.cipherrush-signing/` (override with `CIPHERRUSH_KEYSTORE_PROPERTIES`); without them release builds are unsigned. **Back that folder up somewhere safe** (password manager or encrypted drive); if it is lost, Play App Signing allows an upload-key reset through Play support. Version 1.0.0 (versionCode 1); bump `versionCode` for every upload.
- **Not done:** nothing verified on a real device (O-01). Android builds now need JDK 21 (Android Studio's bundled JBR).

### 2.10 Accounts, ads and store releases (2026-10-28/29, branch `ios-device-testing`)

- **Email:** verification codes and password resets through Zoho ZeptoMail (`backend/mailer.py`, `email_routes.py`). Unverified players stay off leaderboards and Versus. Google/Apple accounts can add a handle and password (`POST /api/me/link-credentials`).
- **Ads (Google AdMob, `frontend/src/ads/`, `backend/ads.py`):**
  - Rewarded video: free Cipher hint, +5 Match-3 moves once per round.
  - Rewarded interstitial: opt-in double points on a scored round, 3 a day, never Rush or Daily.
  - Interstitial: every 3rd finished round, only at a break the player chose, at least 2 min apart.
  - Rewards are granted only by AdMob's signed server-side verification callback (`/api/ads/ssv`, verified in AdMob for all four rewarded units). Every request is non-personalised; UMP consent runs in the EEA/UK/CH.
  - Test builds never request live ads; `npm run sync:release` does. Setup: `mobile/store/ads-setup.md`.
- **Android:** CipherMark launcher icon and splash replace Capacitor's placeholders (`mobile/scripts/android-assets.sh`). Google sign-in from Play installs needed an OAuth client for Play's app signing key (SHA-1 `B5:1C:…:B7:31`), added in Google Cloud. Advertising ID declared in Play Console. Changelog: `mobile/CHANGELOG.md`.
- **iOS:** App Store Connect record created; 1.0.0 (1) and (2) uploaded, (2) with the privacy manifest that matches the App Privacy label (`PrivacyInfo.xcprivacy`). Listing, privacy label and TestFlight steps: `mobile/store/app-store.md`. Store images in `mobile/store/assets/`: header 5244×2950; five iPhone screenshots framed in an iPhone body with a Dynamic Island and a caption (Cipher, Match-3, True/False, offline practice, welcome), in two sets: `ios-iphone-6.3-NN` 1179×2556 (uploaded to the medium-display slot) and `ios-iphone-6.9-NN` 1290×2796 (`ios-store-assets.mjs iphone-set`); three iPad 13" 2048×2732 (`ios-ipad13-01..03`: Match-3, Caesar and True/False practice; `ipad-set`), all uploaded; version-page text (promotional text, description, keywords, support URL) filled in; iPad 11" 1640×2360 (dashboard). All are real captures of the app (simulator or the web build at the iPhone viewport, raw files in `assets/raw/`), 24-bit with no alpha (`mobile/scripts/ios-store-assets.mjs framed|fit`). Upload order and the search-results note are in `app-store.md`.
- **Walkthroughs and quiz hints (2026-10-29, `3de450a`):** a game's ? opens a step-by-step walkthrough with worked tile examples for Cipher, Daily, Rush and Binary/Hex (`constants/walkthroughs.js`, `components/Walkthrough.js`). Security Quiz hints strike out one wrong option (`POST /api/games/quiz/rounds/{id}/hint`): 3 free a round (`QUIZ_FREE_HINTS`), then each needs an SSV-verified rewarded video; no point cost.
- **Builds 2026-10-29:** Android 1.0.0 (5) saved as a draft release on Closed testing - Alpha (not yet sent for review); iOS 1.0.0 (3) uploaded. Both need the `3de450a` server deployed on Render first.
- **AdMob audit (2026-10-29):** account under verification; payment profile complete (AdSense Zimbabwe, US$100 threshold); identity verification not requested yet (it comes at the earnings threshold). Both apps "Requires review / limited ad serving" until linked to a live store listing (AdMob → Apps → Add shop, possible once the app is public on Play / the App Store). All six ad units in AdMob match `ads/config.js`, the native app IDs and `ads.py`. `https://aximoix.com/app-ads.txt` is live (HTTP 200, `public/app-ads.txt` in `AximoIX-website-main`, commit `9c30824`); AdMob → Apps → app-ads.txt can take a day to show it verified.
- **App Store Connect review blockers (2026-10-29):** build 3 selected on version 1.0. Game Center unticked on the version (the app doesn't use GameKit; leaderboards and achievements are server-side), so no entitlement or new build is needed. Price Free in all 175 countries/regions, available in all of them. Privacy policy URL set; privacy label answered for all 10 data types exactly as `mobile/store/app-store.md` (tracking No). Content Rights answer chosen ("No third-party content").
- **Still open:**
  - ~~App Store Connect attestations and Add for Review~~: done, 1.0 is Waiting for Review (§2.11).
  - Google OAuth consent screen is in Testing (only listed test users can use Google sign-in); publish it.
  - Privacy policy text for AdMob and ZeptoMail (`mobile/store/privacy-policy-email-update.md`).
  - Play Data safety rows for AdMob.
  - TestFlight groups and Beta App Review.
  - O-01 device checks.

## 3. Known issues and bug registry

### 3.1 Resolved (kept for traceability)

| ID | Issue | Status |
| --- | --- | --- |
| B-01 | Security Quiz always scored 0% | Fixed, Phase 0 |
| B-02 | Scores, levels and answer keys taken from the client | Fixed, Phase 0 (server-authoritative rounds) |
| B-03 | Email exposed by unauthenticated profile endpoint | Fixed, Phase 0 |
| B-04 | Splash screen never finished (left an invisible overlay) | Fixed, Phase 1 |
| B-05 | Sign-up threw an error instead of logging in. The Phase 2 edit silently didn't apply and lint had no `no-undef` | Fixed, Phase 3. A build now fails on undefined identifiers |
| B-06 | Refresh-token reuse revocation was rolled back by the 401 | Fixed, Phase 3 |
| B-07 | Memory Lock grid inflated itself in portrait (resize feedback loop) | Fixed, Phase 3 |
| B-08 | Match-3 "Racking tiles…" freeze | Fixed, Phase 3.5 |
| B-09 | Daily countdown and timers trusted the device clock | Fixed, Phase 3.5 |
| B-10 | iOS keyboard didn't open after "Start" / "Next" | Fixed in code, Phase 3.5. **Needs a real-device check** (see O-01) |
| B-11 | Glossy padlock iconography | Fixed, Phase 3.5 |
| B-12 | Log out hidden under the bottom nav | Fixed, Phase 4 prep |

### 2.11 Store and AdMob status audit (2026-10-29, evening)

Checked in each console, read-only. Nothing was changed.

| Platform | Status | Blockers or warnings |
| --- | --- | --- |
| **Google Play**, Closed testing - Alpha | Release **5 (1.0.0) active**, published 29 Oct (green tick). Publishing overview: nothing pending, managed publishing off. App status: Closed testing, installed audience 0 | Inbox has two account notices, not yet resolved: "Your identity couldn't be verified" (22 Oct; says the account can't publish apps and offers an appeal) and "an urgent issue with your payments account" (28 Oct, "Fix issue"). Release 5 was published after the first one, so it may be out of date, but the user needs to open both in Play Console → Inbox and confirm. Either could block a later production release |
| **App Store Connect**, iOS 1.0 | **Waiting for Review**, build 3 (1.0.0) attached, sign-in required, review notes filled. Content Rights and App Privacy were done, or submission wouldn't have gone through | None on the page. A new build now means removing the version from review first |
| **AdMob** | Account **"being verified"** (up to 24 h, rarely 2 weeks). Payment profile complete. Both apps (Android `~8484351363`, iOS `~1291549210`) **Requires review / Limited ad serving: "Add store to lift limit"**, 3 active ad units each, no shop linked | Store linking waits on a public listing: Play is closed testing only and iOS isn't approved yet. No identity-verification alert in AdMob (that comes at the payment threshold) |
| **app-ads.txt** | `https://aximoix.com/app-ads.txt` returns HTTP 200 `text/plain` with the AdMob `pub-` line and `f08c47fec0942fa0` | AdMob's app-ads.txt tab can take a day to show it verified |
| **API** | `https://api.aximoix.com/api/time` returns 200 | The reviewer-login fix (`05d595a`: login by handle or email, whitespace-tolerant password, refusal and seeding logs) needs a Manual Deploy on Render if it isn't deployed yet |

**Remaining actions (user):**
1. Play Console → Inbox: open the identity-verification and payments-account notices; fix or appeal if still active.
2. Render: deploy `05d595a`, then confirm the `Review account … created/reset/already uses` lines in the startup logs.
3. App Store: wait for review; answer App Review messages in Resolution Center.
4. AdMob → Apps → Add shop for each app once its listing is public (Play production or open testing; App Store after approval).
5. Still open from §2.10: publish the Google OAuth consent screen, Play Data safety AdMob rows, privacy policy text, TestFlight groups, O-01 device checks.

### 2.12 iPad device pass and Guideline 2.1 reply (2026-10-30)

Apple returned 1.0 (3) under **Guideline 2.1 – Information Needed** (a new developer account with little review history). This is a request for information, not a bug report. Apple wants a screen recording made on a physical device, starting at launch and covering registration, login and account deletion, plus written answers on purpose, setup, external services, regional differences and regulated content. The reply is in `mobile/store/apple-guideline-2.1-response.md` (about 3,600 characters, so it also fits the Notes field), with a `[INSERT_SCREEN_RECORDING_URL]` placeholder and a recording checklist.

Device pass:

| Check | Result | How |
| --- | --- | --- |
| Device detection | iPad Pro 11" (4th gen, iPad14,4, iPadOS 26.6.2) paired over `devicectl`; iPhone 17 Pro Max also paired | `xcrun devicectl list devices` |
| Build, install, launch | Debug build with test ads succeeded; installed and launched; login screen renders correctly at 1668×2388 | `xcodebuild -project App.xcodeproj` (SPM, no workspace), `devicectl device install/launch`, `devicectl device capture screenshot` |
| Walkthroughs (Cipher, Daily) at iPad size | Pass: tiles, the 6-letter Vigenère row, step dots and Back/Next all fit, nothing clipped | Web build at 834×1194 (iPad Pro 11" points), local API |
| Account deletion | Pass: Profile → Delete account → the dialog requires DELETE → `POST /api/me/delete` 200 → "Account deleted" logged → 0 rows left → welcome screen | Throwaway local account, local API |
| Reviewer login (`appstore_review`) | Server side ready: `05d595a` is **live on Render** (handle or email, pasted whitespace forgiven, refusals logged). Not exercised by the agent: it doesn't type production passwords | The user signs in on the iPad |
| Rewarded-video hints on device | **Not yet verified on hardware.** Needs taps on the iPad. The SSV path is covered by `tests/test_ads.py`; the UI by `QuizGame.test.js` | The user, during the recording |

Note: the deletion endpoint is `POST /api/me/delete` (there is no `/api/auth/delete`).

**Remaining for the user:** charge the iPad (it was at 7%) → record the flow in the checklist → upload unlisted → paste the link into the reply → send the reply in App Store Connect → paste the same text into App Review Information → Notes → Resubmit to App Review.

### 2.13 Tester links (2026-10-30)

All links and the joining steps are in `TESTING_LINKS.md`.
- **Android:** Closed testing - Alpha is active, with release 5 (1.0.0). Testers come from email list `test1` (3 addresses). Join on the web: https://play.google.com/apps/testing/com.aximoix.cipherrush. A new tester must be added to `test1` first.
- **iOS:** TestFlight external group `external` has build 1.0.0 (3). Public link https://testflight.apple.com/join/gyxtrtHv, 1 of 10 tester slots used.
- **App Store:** https://apps.apple.com/app/id6828379997 goes live after approval.
- **Testers invited (2026-10-30/31):** `test1` now holds 9 addresses (Play has no email invite; send testers the web opt-in link). TestFlight `external` has 4 email invites plus 1 public-link tester. One Android address was refused because it isn't a Google account. Names and addresses are kept out of git, in the gitignored `mobile/store/TESTERS_LIST.md`.
- **Status 2026-10-31:** Play production access needs 12 opted-in testers for 14 days; 6 of the 9 on `test1` have opted in (Play doesn't show which), and nothing is in Play review. iOS 1.0 is still Waiting for Review (resubmitted 2026-10-30 08:45), with no new message from Apple. TestFlight: 2 of the 4 email invitees have installed it.
- **Audit 2026-11-02:**
  - Play: `test1` holds 12 addresses, 9 opted in. The 12-opted-in requirement is not met, so the 14-day requirement has no tick and the Console shows no countdown. Earliest production application is 14 days after the 12th opt-in. Nothing in review; last published 29 Oct.
  - Play notices: "Your identity couldn't be verified" (22 Oct) is still listed and says the account can't publish apps; it offers an appeal. The Developer account page shows no matching warning, and release 5 was published after the notice. Current effect on production is unconfirmed; the owner must check it. Also listed: enrolled for the 15% service fee (28 Oct), add Play Games services (29 Oct).
  - iOS: 1.0 (build 3) Waiting for Review since Fri 30 Oct 08:45. The submission has 2 messages (Apple's and our reply), nothing new. The App Review sidebar shows a red dot.
  - TestFlight: `external` is working, with 5 testers and build 1.0.0 (3). 3 installed, 2 invited (no install yet), no crashes or feedback.
- **2026-11-05:** 2 Android testers were added (`test1` now holds 14; still 9 opted in, 12 needed) and 1 TestFlight email invite was sent (`external` now has 6 testers: 3 installed, 3 invited).
- **Audit 2026-11-09:**
  - Play: the "12 testers opted in" task is ticked. The dashboard says "12 testers have currently been opted in for 4 days continuously", so the 14-day run should end around 19 Nov if 12 stay opted in (no margin). `test1` now holds 16 addresses (one more was added outside this session). Closed testing - Alpha is active, latest release 5 (1.0.0), 178 countries/regions.
  - Play notices: "Your identity couldn't be verified" (22 Oct) is still listed. New since the last audit: "Declare your trader status by 1 February 2027" (action required, 5 Nov) and "Review changes to Google Play policies" (5 Nov).
  - iOS: 1.0 (build 3) still Waiting for Review since 30 Oct 08:45 (10 days). Still 2 messages, nothing new from Apple.
  - TestFlight: unchanged. 3 installed (2 named testers plus the public link), 3 invited and not yet accepted, no crashes or feedback.
- **2026-11-11: iOS rejected under Guideline 2.3.6 (Accurate Metadata).** Apple's 3rd message (reviewed on iPad Air 11-inch M3) says the Age Rating questionnaire claimed In-App Controls but the app has no Parental Controls or Age Assurance. Fix: the questionnaire's Parental Controls answer was changed from Yes to No and saved (Age Assurance was already No; rating still 4+). No new build needed. The Resolution Center reply is drafted in `mobile/store/apple-guideline-2.3.6-response.md`; sending it and pressing "Resubmit to App Review" are still to do. Open question: the questionnaire's "Advertising" answer is No although the app shows AdMob ads (`mobile/store/app-store.md` says ads: Yes).
- **2026-11-11 (later):** Advertising changed from No to Yes and saved; questionnaire now reads Parental Controls No, Age Assurance No, Advertising Yes, rating 4+. The reply (updated to mention both corrections) was sent in App Review; the submission shows 4 messages. **Not yet resubmitted:** "Resubmit to App Review" is greyed out on the submission page; the version page's "Update Review" button needs clicking by the developer.
- **Audit 2026-11-12:** iOS 1.0 (3) was resubmitted by the developer on 11 Nov at 10:05 AM and is **Waiting for Review**; no new Apple message since our reply (4 messages). Play: day 7 of 14 with exactly 12 testers opted in (earliest production application around 19 Nov). Notices unchanged: identity verification (22 Oct), trader status by 1 Feb 2027, policy changes (5 Nov). TestFlight `external`: unchanged, 3 installed, 3 invited, no crashes.
- **Audit 2026-11-16:** iOS 1.0 (3) still **Waiting for Review** (submitted 11 Nov, 5 days); no new Apple message. Play: 12 testers opted in for **11 of 14 days**; "Apply for production" still disabled. Window completes around 19 Nov if all 12 stay opted in. Trader status banner unchanged (due Feb 2027).
- **Audit 2026-11-23 (Render only; Chrome extension disconnected, stores not rechecked):** API up via `api.aximoix.com` (cold start 38 s on first request, then ~0.4 s); database reachable (leaderboard returns live player data). Free Postgres was created 2026-10-28, so the 30-day free period ends about **2026-11-27**; upgrade it in place before then (Render deletes expired free databases after a grace period, and free databases have no backups).
- **Audit 2026-11-23 (live consoles):** Render: `cipherrush-db` Free, Available, PostgreSQL 16, 6.64% of 1 GB used; dashboard banner: **expires 27 Nov 2026, then deleted unless upgraded**. `cipherrush-api` Free, Deployed, live commit `05d595a`, spins down when idle (50 s+ first request). Developer chose to stay on free plans for now; `render.yaml` left on `plan: free`. Play: all three production-access tasks ticked (closed release, 12+ testers, 14 days); **"Apply for production" is enabled**, not yet submitted. Notifications: trader status by 1 Feb 2027 still open; identity verification notice no longer listed. App Store: iOS 1.0 (3) still **Waiting for Review** (12 days since 11 Nov resubmission), no new Apple message (4 messages, last ours on 11 Nov).
- **2026-11-23 submissions:** (1) **Apple expedited review requested** via developer.apple.com/contact/app-store (topic expedite, app CipherRush, ID 6828379997, iOS). Confirmation page: "We'll expedite review for CipherRush"; a rejection would resubmit straight into the expedited queue. The current form has no message field, so no explanation text was sent and no case number was shown. (2) **Play production access applied** at 10:29: the dashboard shows "We have your application for production access", review usually 7 days or less, result emailed to the account owner. Answers covered recruitment (closed email list plus opt-in link; a college mate, university peers, local Android developers from a WhatsApp group; 16 added, 12+ opted in for 14 days; ease: Difficult), engagement, feedback (WhatsApp and DMs), audience (13+, casual puzzle and cybersecurity-curious players), expected installs 0 to 10K, changes (`05d595a` login, `4c6bdce` cold-start retry, `3de450a` walkthroughs and hints) and readiness. No pre-launch report exists, so readiness cites Android vitals: no user-perceived crashes or ANRs in 28 days.
- **2026-11-23 (later): iOS 1.0 (3) APPROVED.** Submission `51ebdd81…` shows Review Completed / Approved; the version page shows **Ready for Distribution** (after the expedite request). New ASC notices: age-rating answers for Location Sharing and Dating due 15 Jan 2027; China mainland Security Assessment and AIGC declaration due 31 Jan 2027 (only if distributing in China). Play: production access application still under review.
- **2026-11-23 country allowlist** (35 countries): United States, Canada, United Kingdom, Australia, New Zealand, Zimbabwe; EU 27 (Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden); Norway, Switzerland. Iceland and Liechtenstein (EEA) are not on the list.
  - **iOS: applied and confirmed.** Apple said the app is removed from 140 countries or regions (live within 24 h); China mainland is Processing to Not Available. **8 are Available** (US, CA, UK, AU, NZ, NO, CH, ZW). The **27 EU countries are selected but blocked: "Trader Status Not Provided"** (EU Digital Services Act). Declare trader status in App Store Connect (Business, or App Information, then Digital Services Act) to go live there. Binaries unchanged.
  - **iOS age rating (Location Sharing = No, Dating = No): not done.** The questionnaire is read-only while 1.0 is Ready for Distribution, with all 18 answers disabled. Answer it when creating the next version (deadline 15 Jan 2027).
  - **Play: not applied.** The Production track is locked ("You don't have access to production yet") while the access application is under review. Closed testing - Alpha countries were left alone so as not to disturb the review or the testers. **To do once production is approved:** set the Production countries to the 35 above when creating the first production release.

### 2.14 Version 1.0.1 (2026-11-23, branch `v1.0.1`, local only)

Android 1.0.1 (versionCode 6) and iOS 1.0.1 (build 4). Commits on `v1.0.1` are local; nothing has been pushed, built or uploaded. Details are in `mobile/CHANGELOG.md`.
- **Home screen:** each of the six modes is a card with an animated SVG preview (`components/GamePreview.js`) and its own ? button. Every mode now has a walkthrough of at least 3 steps. Android edge-to-edge: `--safe-*` takes the larger of `env()` and Capacitor SystemBars' `--safe-area-inset-*`, so the Daily Cipher banner clears the status bar.
- **Security Quiz hints:** no change needed. The 3 free hints, then a rewarded video, then a graceful "no video" fallback, were already in 1.0.0 (3) and are enforced on the server.
- **Languages:** en, es, fr, de, pt, it, nl, pl (`frontend/src/i18n/`), with a picker under Profile > Language saved in localStorage. Covers menus, the home screen, mode rules, walkthroughs, profile and ranks. Puzzles, quiz questions, true/false claims, in-game buttons and account forms stay in English. The translations were written by the agent and need a native-speaker check (like O-05).
- **Handle blocklist:** new terms (hitler, adolf, god (exact), allah, osama, bin laden, lucifer, sex, fruit, nutella, twitter, messiah, jesus, satan), leetspeak readings and an allow list (sussex, grapefruit, callahan, abdallah...). Message: "That username isn't available. Please choose another." The server and app share one JSON list.
- **Copy:** calmer, skill-focused taglines ("Verify before you trust", "Test your cyber instincts", "Spot the pattern. Decode the signal.").
- **Low-data startup:**
  - `frontend/src/cache.js` is a per-account, stale-while-revalidate localStorage cache for `/me/dashboard`, `/daily`, `/me/profile`, the three leaderboards and the last `/auth/me`. It is wiped on logout or a 401, and entries older than a week are ignored. It is display only, so scoring is untouched.
  - Identical GETs in flight are shared.
  - The server gzips responses over 1 KB.
  - Scored quiz and true/false banks are deliberately **not** bundled: their answers would be public. Practice Mode already ships its own offline bank.
- **Released 2026-11-23:**
  - **Git:** `v1.0.1` (`bceb9a3`) was pushed to `origin`. It was fast-forwarded onto `ios-device-testing` (`61c951e..bceb9a3`), the branch Render deploys. `main` was not changed.
  - **Render:** Render had no auto-deploy hook, so the deploy was started with Manual Deploy > Deploy latest commit. It succeeded in 1 m 19 s and `cipherrush-api` is live on `bceb9a3`. `api.aximoix.com` now returns `content-encoding: gzip`. The plan was left on Free.
  - **Android 1.0.1 (6):** built with `npm run sync:release` (live AdMob IDs, `api.aximoix.com`), then `./gradlew bundleRelease`. Gradle needs JDK 21: use `JAVA_HOME` set to Android Studio's bundled JBR. The bundle is signed with the AximoIX upload key. It was uploaded to **Closed testing - Alpha** as release "6 (1.0.1)" with en-GB release notes and sent for review (**Changes in review**). The only warning was "no deobfuscation file" (R8 is off). The production access application and the Production track were not touched.
  - **iOS 1.0.1 (4):** archived with `xcodebuild archive`, then uploaded with `-exportArchive` (`app-store-connect`, destination `upload`). Build 4 processed in a few minutes.
    - Version 1.0.1 was created with the What's New text, build 4 attached, and submitted: **Waiting for Review**, submitted 12:08.
    - Age rating: Location Sharing No and Dating No were saved under App Information. The rating is still 4+, and the 15 Jan 2027 notice is gone.
  - **EU DSA trader status: not submitted.** The Apple developer account's legal entity is the individual **Tadiwa Mwenje** (Harare, Zimbabwe), not AximoIX. The AximoIX website records give a US address (Decatur, GA) and a +1 phone number. Apple displays the declared address, phone and email publicly on the EU product page and verifies the phone and email with codes. The owner must decide whether to declare as a trader and which contact details to publish. The 27 EU countries stay blocked ("Trader Status Not Provided") until then.

- **2026-11-23 compliance and AdMob (in progress):**
  - **Play release 6 (1.0.1):** review passed and **published on Closed testing - Alpha** on 23 Nov. The production access application is still under review and was not touched.
  - **Apple DSA (individual trader): not finished.** "I'm a trader" was chosen, with the owner's personal contact details (kept out of git). The email code expired, and Apple then locked further attempts after repeated requests. Retry on 24 Nov: Business, then Complete Compliance Requirements, then the email code, then the phone code. The 27 EU countries stay "Trader Status Not Provided" until then.
  - **Play trader status: done (account level), app level in review.** The account is declared as a **Trader**. The developer email and phone shown publicly were already verified, so no SMS code was needed. The legal name and address come from the Google payments profile. App content > "App-level trader status and Terms of Service" is set to "Yes, my trader status applies to this app", with ToS `https://aximoix.com/terms/#cipherrush` (live, HTTP 200). It was sent for review on 23 Nov as the only change; the production access application was not touched.
  - **AdMob:**
    - The iOS app is **linked to the App Store listing** (found by store URL; searching by ID found nothing).
    - app-ads.txt is not yet verified. AdMob reads the developer website from the listing's Marketing URL, which version 1.0 doesn't have. **The Marketing URL `https://aximoix.com` is saved on iOS 1.0.1** (metadata only; build 4 is still Waiting for Review). "Check for updates" on 23 Nov still failed, as expected, because the public listing is still 1.0. Once 1.0.1 is approved, run AdMob > CipherRush (iOS) > App settings > Verify app > Check for updates. `aximoix.com/app-ads.txt` itself is correct.
    - Android can't be linked until the app is in production: Play search doesn't list closed-testing apps.
    - Ad unit IDs are unchanged; both apps still show "Limited ad serving".
  - **Apple DSA: paused until 24 Nov** (Apple rate-limited the verification codes). Then: Business > Complete Compliance Requirements > trader > the owner's contact details > email code > phone code. Afterwards, check Pricing and Availability for the 27 EU countries.

### 2.15 Version 1.0.2 (2026-11-23, branch `v1.0.2`, local only)

Android 1.0.2 (versionCode 7) and iOS 1.0.2 (build 5). Fixes from the phone QA of 1.0.1 (Samsung, Play Alpha build 6). Commits are local; nothing has been pushed, built or uploaded, and Render was not touched. Details are in `mobile/CHANGELOG.md`.

- **i18n:** about 300 new keys in `frontend/src/i18n/en.js` and all seven locale files. Every game, Practice, Versus, sign-in, account, reminders, toasts, sharing and leaderboard rows now translate. New helpers in `i18n/index.js`: `formatNumber`, `formatDate` (English shows en-GB, "23 Nov 2026") and `rich()` for sentences with links or bold words. Mode titles come from `hooks/useModeLabel.js`. Still English: puzzle and quiz content, and `detail` messages written by the server.
- **Offline banner:** sits below the safe area and reserves its height through `--banner-space`. It uses round-specific copy only on `/game/*` routes.
- **Tutorial:** all steps share one grid cell (`.walkthrough-stage`), so the sheet height is fixed. Nav buttons don't wrap or shrink.
- **Profile:** four cards in order: identity (handle form full width, stats); Preferences (`components/Preferences.js`: language, sound, vibration, reminders); Account and data; danger zone (log out, delete). Sound (`cr_sound`) and haptics (`cr_haptics`) choices are saved on the device. "Clear saved data" empties the offline cache but keeps the session. There is no data-export endpoint yet; account deletion and the privacy policy cover data requests for now.
- **Moderation:** new `transpose` list (one adjacent swap of high-severity names; swaps of 6+ letters match anywhere, shorter ones only as a whole handle or part); `_ . -` separators; terror and extremist names. Both blocklist JSON copies are identical. A dictionary scan (`/usr/share/dict/words`) found one newly blocked word (gestapo, intended) and no regressions. The refusal message is unchanged.
- **QA screenshots** from 1.0.0 and 1.0.1 are in `mobile/store/qa-screenshots/` (gitignored). Shots showing the account email were left out.
- **Device check (Samsung, debug build of 1.0.2 (7), live server, 23 Nov):** Profile order, full-width handle, en-GB dates, French games/ranks/tutorial and the offline banner all checked. Fixed during the check: the banner was capped at half the screen width (`left: 50%` + translate) and wrapped over the title; it is now centred with auto margins and reserves its measured height. Tutorial dots no longer get squeezed; French uses non-breaking spaces inside « » and before : ; ! ?; "Caesar" and the free cipher hints are translated (`games/cipherText.js`). The Play build was uninstalled for this check, so the phone now runs the debug build. Screenshots without the email are in `mobile/store/qa-screenshots/v102/`.
- **Audio:** `frontend/src/utils/soundEngine.js` synthesises everything with Web Audio (no asset files; about 4 KB gzipped). Buses: track fade, music bus (soft low-pass), sfx bus, master; master follows volume² and mute. Music is a step sequencer (25 ms timer, 120 ms lookahead on the audio clock) that only runs while a track is chosen and music is on and unmuted. Loops: `cipher` (Cipher, Daily, Practice Caesar), `rush` (tempo ×1.15 in the last 15 s via `setMusicIntensity`), `binhex`, `quiz`, `truefalse`, `playful` (Match-3, Memory), `versus`. The context pauses per reason (`pauseAudio("background" | "ad")`) and resumes when no reason is left; `ads/admob.js` holds it while an ad shows. Settings live in `utils/audioSettings.js` (`cr_audio`: music, sfx, volume 0-1, muted; migrates the earlier `cr_sound`), shared by `components/AudioControl.js` (header popover) and Profile > Preferences. When no loop is scheduled and nothing has played for 3 s, the context suspends so the phone's audio output can sleep; the next sound wakes it. Checked in desktop Chrome and on the Samsung (debug build, 23 Nov): the app plays as one media-usage AAudio stream (so the volume buttons control it); the stream stops on menus, when muted and in the background, and restarts in a game or on unmute; Profile and the in-game panel stay in sync. Game titles now wrap to two lines instead of being cut off by the extra speaker button. **Loudness fix (23 Nov):** measured with `renderOffline` (dev handle `window.__cipherAudio.measure`), the first version was about 35 dB too quiet (music around -55 dBFS RMS on a phone-speaker estimate), which is why nothing was heard. Now: music bus ×3.5 and sfx bus ×3 into a master limiter (threshold -12 dB); music about -24 to -31 dBFS RMS, effects peaking -6 to -14 dBFS, no clipping at 100% volume; low notes get an octave-up overtone and the kick a click, since phone speakers can't play below about 200 Hz. Switching Music on plays a short phrase, unmuting and the volume slider play a tap.
- **iOS audio:** `AppDelegate.swift` sets `AVAudioSession` to `.playback` with `.mixWithOthers` (owner's choice, 23 Nov): game audio plays with the silent switch on and mixes with other apps instead of stopping them; no `UIBackgroundModes` audio, so it still stops off-screen. The web layer re-wakes a paused context on the next tap while a loop should play, because iOS can refuse `resume()` outside a gesture (after backgrounding, a call or an ad). Installed on an iPhone 17 Pro Max as a debug build; the listening check is the owner's (the Mac can screenshot but not tap the phone).
- **Audio wake-up (24 Nov, `9d7c2d0`):** every tap now resumes a paused context inside the gesture (unless paused for the background or an ad), so the tap that opens a game or unmutes is the one that wakes iOS audio; with nothing playing it sleeps again after 3 s. Debug build installed on the iPhone 17 Pro Max; the listening check is the owner's.
- **Store and ad-network status (24 Nov):**
  - **Apple DSA trader declaration:** "I'm a trader" chosen; contact email and phone verified by the owner. Apple then asks for identification documents (address proof upload); waiting on the owner. EU availability follows once accepted.
  - **App Store 1.0.1 is Ready for Distribution.** iOS version **1.0.2** created in App Store Connect (Prepare for Submission) with Marketing URL `https://aximoix.com`. Its "What's New" text is still copied from 1.0.1 and needs replacing before submission. 1.0.1 already carries the Marketing URL.
  - **AdMob iOS app verification:** "Check for updates" run on 24 Nov; still "couldn't verify" (crawl of the newly live 1.0.1 listing pending). Retry in a day.
  - **Google Play:** production access still under review (applied 23 Nov). Account-level trader status is declared with verified contact phone and email, and App content > App-level trader status and Terms of Service (`https://aximoix.com/terms/#cipherrush`) is already actioned. Production rollout, the 35-country list and the AdMob Android store link wait for approval.
  - **Unity Ads (for AdMob bidding in 1.0.2):** project CipherRush, general-audience (not child-directed). iOS app Game ID `800450704` (store ID 6828379997); Android app Game ID `800450707` (no store URL until the Play listing is public; add it in Unity then). Bidding placements: `BP_Rewarded_iOS`, `BP_Interstitial_iOS`, `BP_Rewarded_Android`, `BP_Interstitial_Android` (no banner; Unity's AdMob adapter has no rewarded-interstitial format, so that unit stays AdMob-only). Unity's required app-ads.txt lines (163, including `unity.com, 164956280, DIRECT, 96cabb5fbdde37a7`) must be added to `aximoix.com/app-ads.txt`, and Unity's developer website set to `https://aximoix.com`. Unity also lists 76 SKAdNetwork IDs missing from `Info.plist`. Still to do: AdMob mediation group(s) with Unity bidding, and the Unity adapter (`GoogleMobileAdsMediationUnity` / `com.google.ads.mediation:unity`) in the native projects.
- **Unity mediation live in config (24 Nov, later):**
  - **app-ads.txt:** Unity's 163 seller lines appended to `public/app-ads.txt` in `AximoIX-website-main` (commit `b23e86a`, pushed to `main`; GitHub Pages deploy succeeded, `gh-pages` `f5004b1` serves 164 entries incl. the AdMob DIRECT line and `unity.com, 164956280, DIRECT, 96cabb5fbdde37a7`). The local checkout there has unrelated uncommitted changes and was left alone (work done in a separate worktree). This Mac's network can't reach GitHub Pages IPs (185.199.108-111.153), so `curl aximoix.com` times out locally; Unity's own crawler fetched the file.
  - **Unity dashboard:** developer website `https://aximoix.com`; app-ads.txt status "up-to-date, no action needed".
  - **AdMob:** iOS app verification still "couldn't verify" after another Check for updates (24 Nov); retry daily. Ads Data Processing Terms (secure signal sharing) and the Unity bidding agreement accepted with the owner's OK. Four mediation groups, all enabled, each AdMob Network + Unity Ads bidding: iOS Rewarded (`BP_Rewarded_iOS`, Game ID 800450704), iOS Interstitial (`BP_Interstitial_iOS`), Android Rewarded (`BP_Rewarded_Android`, Game ID 800450707), Android Interstitial (`BP_Interstitial_Android`). Rewarded interstitial stays on the AdMob default group.
  - **Native (`19b9c8c`):** iOS adds the Swift package `googleads-mobile-ios-mediation-unity` 4.22.000 (Unity Ads 4.22.0) to the App target in `project.pbxproj` (Capacitor's `CapApp-SPM/Package.swift` untouched, so `cap sync` won't remove it); `Info.plist` now has 76 SKAdNetwork IDs. Android adds `com.google.ads.mediation:unity:4.20.1.0` (built against play-services-ads 25.4.0, what we resolve) and `com.unity3d.ads:unity-ads:4.20.1`. iOS Release build embeds UnityAdapter/UnityAds frameworks; Android debug and release APKs build and contain the adapter and SDK.
  - **App Store Connect:** DSA declaration status "In Review" (27 countries, updated 24 Nov); EU countries still "Trader Status Not Provided" until accepted. 1.0.2 "What's New" rewritten (music and sound with controls; 8-language translations; Profile and offline indicators) and saved; not submitted. Only the English (U.K.) localisation exists.
- **Render paid plans (27 Nov, the day the free database was due to expire):** the owner upgraded `cipherrush-db` to Basic-256mb (`0.1c-256mb`, about $6/month, daily backups, no expiry; data kept) and `cipherrush-api` to Starter (`0.5c-512mb`, $7/month, always on). Render redeployed the API ("Compute plan updated", live on `2a192cd`). Checked: `api.aximoix.com/api/time` and the leaderboard answer in about 0.4 s with no cold start. The workspace stays on Hobby (the $25 Pro plan adds team features, not compute). `render.yaml` updated to `basic-256mb` / `starter` on `v1.0.2`; it reaches Render only when merged into `ios-device-testing`, and a Blueprint sync before that would read the old `plan: free`.
- **Production rollout (27 Nov):**
  - **Git:** tests green (backend 276, frontend 284). `v1.0.2` pushed; `ios-device-testing` fast-forwarded to `ba9441b` and pushed.
  - **Render:** manual deploy of `ba9441b` succeeded and is live (handle blocklist and paid-plan `render.yaml`). API and leaderboard answer in 0.4-0.8 s.
  - **Play:** production access approved. Production countries set to exactly the 35 in the allowlist. Release 7 (1.0.2) built with `npm run sync:release` + `./gradlew bundleRelease` (live ad IDs, upload key), uploaded, en-GB release notes (player-facing features only: music and sound, speaker button, full translations, Profile, formats, offline banner/tutorial/handle field). Sent for review as **full rollout**; managed publishing is off, so it goes live automatically on approval. The browser tool can't upload files over 10.4 MB, so the owner drags the .aab in.
  - **iOS:** build 5 archived and uploaded with `xcodebuild -exportArchive` (destination upload), processed in a few minutes, attached to 1.0.2 and **submitted: Waiting for Review**. What's New and Marketing URL `https://aximoix.com` confirmed.
  - **Apple DSA:** still **In Review** (27 countries, last updated 24 Nov); the EU stays "Trader Status Not Provided" until approved.
  - **AdMob:** iOS "Check for updates" still "couldn't verify", although the live listing's `sellerUrl` is `https://aximoix.com` and `app-ads.txt` has the DIRECT line; wait for the crawler (up to 7 days) and retry. All 4 Unity bidding groups enabled.
  - **Store notes rule:** release notes and What's New never mention ads, the server/API or security internals.
  - **Next:** once Play approves and the listing is public: link the Play store in AdMob (Android) and add `https://play.google.com/store/apps/details?id=com.aximoix.cipherrush` to the Unity Android app (800450707). Retry AdMob iOS verification.
- ~~Next: push `v1.0.2`, deploy the server, and build and upload Android 7 and iOS 5.~~ Done 27 Nov (above). Reinstall the Play build on the test phone afterwards if needed.
- **27 Nov, later: store status and ad-serving audit.**
  - **Play:** 1.0.2 (7) approved and **published to Production** (35 countries). The public listing is live at `https://play.google.com/store/apps/details?id=com.aximoix.cipherrush`.
  - **iOS:** 1.0.2 (5) **Waiting for Review**. Apple DSA still **In Review** (27 EU countries locked).
  - **AdMob Android:** Google Play store linked (found by the full listing URL; a package-name search didn't find it yet). Verification fails because **the Play listing has no developer website**: AdMob finds app-ads.txt through Store settings > Contact details > Website. Needs `https://aximoix.com` there.
  - **AdMob iOS:** still "couldn't verify". The live listing's `sellerUrl` is `https://aximoix.com`, and the deployed file starts with the exact DIRECT line (no BOM, LF line endings). Waiting on Google's crawler.
  - **AdMob Privacy & messaging: no European regulations (GDPR) message exists.** Google requires a certified consent message for any ads (personalised or not) to EEA/UK/CH users, which is 30 of the 35 Play countries, and Unity bidding needs it too. The app already runs the UMP consent flow (`ads/admob.js`), so publishing a message needs no app update. Owner decision pending.
  - **AdMob:** Policy centre "No current issues"; payments profile set, no holds (identity verification only at the payout threshold). All 4 Unity bidding groups enabled. No ATT prompt: ads are non-personalised (`npa: true`), so IDFA isn't used.
  - **Unity:** Android app (800450707) Store ID set to `com.aximoix.cipherrush`.
- **v1.0.3 hardening (branch `v1.0.3`, local, not deployed):**
  - **Server:** `/docs`, `/redoc` and `/openapi.json` were public in production; now off when `ENVIRONMENT=production`. HSTS (`max-age=31536000; includeSubDomains`) added in production. A catch-all exception handler logs the traceback and returns a generic message. Already in place and confirmed: nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, CORS allowlist from `CORS_ORIGINS` (GET/POST only), CSRF header check, and rate limits on every auth, account, email, ad-reward and game route (logout excepted).
  - **App:** server/gateway failures (5xx) show "Server unavailable right now. Try again soon." in all 8 languages instead of status codes or error pages. Raw axios messages are no longer used as a fallback (Boost, Quiz, Cipher, Match-3). The round-start error is translated. Sign-in errors go through `errorMessage` (a 422 list could no longer reach the screen). The privacy line (`legal.data`, 8 languages) no longer names the API host. The API URL lives only in `REACT_APP_BACKEND_URL`.
  - **Build:** `GENERATE_SOURCEMAP=false` in `frontend/.env.production`; before this, the `.js.map` (full source) shipped inside both apps. Terser drops `console.log/info/debug` (warn/error stay for crash logs). Declared `@babel/plugin-proposal-private-property-in-object` so the CRA build notice is gone.
  - **Native:** Android `allowBackup="false"` so the session cookie isn't restored onto another device. HTTPS-only confirmed: iOS ATS has no arbitrary loads (local networking only), Android cleartext is off by default, and `androidScheme` is https. Sessions are HttpOnly cookies (never readable from JS), cleared with token revocation on logout and account deletion.
  - Tests: backend 279, frontend 286. Production web build compiles cleanly.
  - **To ship 1.0.3:** merge into `ios-device-testing` and deploy on Render (server changes are independent of the apps). Then build Android 8 / iOS 6 with `npm run sync:release` and send them to the stores.

### 3.2 Open

| ID | Issue | Severity | Notes |
| --- | --- | --- | --- |
| O-01 | No real-device verification yet | High | Keyboard focus hand-off on iOS, swipe feel, haptics, 60 fps on mid-range Android. All were verified only in desktop Chrome, the device lab and unit tests |
| O-02 | ~~Native app icons and splash~~ | Generated 2026-10-21; light/dark home-screen check pending | Generate from `frontend/src/brand/icon-source.svg` with `@capacitor/assets` |
| O-03 | ~~`appId` placeholder~~ | Resolved | Now `com.aximoix.cipherrush` |
| O-04 | Legacy leaderboard scores were earned under the old, inflated economy | Medium | Reset before launch (§4, Phase 5) |
| O-05 | Content (~400 items) written and fact-checked by the agent only | Medium | Needs a human subject-matter review |
| O-06 | Economy numbers untuned by real players | Low | All numbers live in `economy.py` |
| O-07 | `device-lab.html` ships in production builds | Low | Dev tool in `frontend/public/`. Exclude or gate before launch |
| O-08 | Backend venv is Python 3.9 | Low | Works today; move to 3.11+ for long-term support |
| O-09 | FastAPI `on_event` deprecation warnings | Low | Migrate to lifespan handlers |
| O-10 | Versus mode is a placeholder | Product | Shows opponents from the leaderboard; no matchmaking |
| O-11 | Branch push | See §4 | The AximoIX repo pushed fine on 2026-10-21, so the credentials work again |
| O-13 | Google / Apple sign-in needs real client IDs | High for launch | Code and tests are done; buttons stay hidden until configured. Steps in `mobile/README.md` (OAuth consent screen, Web/iOS/Android clients, Apple App ID + key, iOS reversed-client-ID URL scheme) |
| O-14 | Apple refresh tokens stored unencrypted | Low | Only usable together with the server's `.p8` key. Consider encrypting at rest |
| O-15 | ~~No production API~~ | Live 2026-10-28 on free plans | `https://api.aximoix.com` (Cloudflare-proxied CNAME to `cipherrush-api.onrender.com`; Render Blueprint `cipherrush` from `render.yaml`, Frankfurt). Before launch: move to paid plans (free web sleeps after 15 min idle; free Postgres expires after 30 days), grant Render's GitHub app access to the repo for auto-deploy (it currently deploys from the public URL, so backend changes need a manual sync), add the Apple keys in the dashboard |
| O-12 | Database password present in git history | Medium | `backend/.env` was tracked before Phase 0. Rotate the password; optionally rewrite history |

---

## 4. Forward-looking roadmap

### Phase 3.5: post-fix engineering (code complete; device verification outstanding)

- [x] Match-3 freeze patch, cascade and generation caps, response contract tests
- [x] Client clock decoupling (`/api/time`, monotonic timers, attempt binding)
- [x] Replace AI-style iconography (splash, welcome, app icons, UI glyphs)
- [ ] **Real-device tests (O-01).** Install a debug build on at least one iPhone and one mid-range Android phone and check:
  - Speed Rush → Start: the keyboard appears without a second tap.
  - Cipher → Next cipher: the keyboard appears.
  - Match-3: swipe in portrait and landscape.
  - Rotating mid-round keeps the round.
  - Losing signal mid-round shows the banner and the round resumes.
  - Haptics fire.
  - Frame rate stays smooth during Match-3 cascades.

### Phase 4: native mobile packaging (in progress)

- [x] Capacitor iOS and Android projects (`mobile/`), building successfully
- [x] CapacitorHttp and CapacitorCookies for cookie auth inside the native shells
- [x] Native haptics plugin integrated
- [x] Final `appId`: `com.aximoix.cipherrush`
- [x] Google / Apple sign-in (server verification, native and web clients), in-app account deletion, AximoIX legal links
- [x] Create the OAuth clients and Apple key, then fill the env vars (O-13). Consent screen still to be published
- [x] Generate native icons and splash from the rotor artwork (O-02; Android done 2026-10-29)
- [x] Configure signing: an Apple team and provisioning profile; an Android release keystore (stored outside the repo)
- [x] Production API on HTTPS. Build with `REACT_APP_BACKEND_URL=https://…`. Confirm sessions survive an app restart (refresh cookie persists in the native cookie store)
- [ ] TestFlight and Play testing tracks: Play closed testing (Alpha) set up; iOS build 2 uploaded, TestFlight groups not yet created

### Phase 5: production deployment and pre-launch

- [ ] **Secrets:** generate a fresh `JWT_SECRET` (rotating it signs everyone out), set `COOKIE_SECURE=true`, rotate the database password (O-12), and set `CORS_ORIGINS` to the production origins plus the Capacitor origins.
- [ ] **Containerise** the API (and optionally the web build). Extend `docker-compose.yml` beyond the database.
- [ ] **Leaderboard reset (O-04).** Clear `game_sessions`, `game_progress`, `achievements`, `daily_attempts` and `game_rounds`, and reset `users.total_score / level / puzzles_completed / badges`. Announce it to existing players.
- [ ] **CI/CD:** on every PR, run the backend suite (66 tests) against a disposable Postgres, the frontend Jest suite (35 tests), and a strict build (`CI=true yarn build`). Block merges on failure. Build the native apps on release tags.
- [ ] Human content review (O-05) and a first economy tuning pass from real play data (O-06).
- [ ] Exclude `device-lab.html` from production builds (O-07).

---

## Appendix A: API surface

All under `/api`. Every POST requires `X-Requested-With: CipherRush`. Game actions accept an optional `X-Request-Id` for idempotent retries.

| Area | Endpoints |
| --- | --- |
| Auth | `POST auth/register` · `POST auth/login` · `POST auth/refresh` · `POST auth/logout` · `GET auth/me` · `GET auth/providers` · `POST auth/google` · `POST auth/apple` |
| Me | `GET me/dashboard` · `GET me/game-progress` · `GET me/profile` · `GET me/account` · `POST me/username` · `POST me/delete` |
| Games | `POST games/{mode}/rounds` (start) · `GET games/{mode}/rounds/active` (resume) |
| Game actions | cipher `…/hint`, `…/submit` · quiz `…/submit` · truefalse `…/answer` · binhex `…/answer` · match3 `…/swap` · memory `…/flip` · rush `…/answer`, `…/skip`, `…/finish` |
| Daily | `GET daily` · `POST daily/start` · `POST daily/rounds/{id}/submit` |
| Public | `GET leaderboard` · `GET leaderboard/rush` · `GET leaderboard/daily` · `GET time` |
| Versus | `GET battle/queue` (placeholder) |

## Appendix B: data model

| Table | Purpose |
| --- | --- |
| `users` | Account, bcrypt hash, totals, badges, `session_version` (bumped on logout or token theft) |
| `game_rounds` | Live and finished rounds. Secret state as JSONB, `expires_at`, `completed_at` (set once) |
| `game_sessions` | Completed-round history (feeds profile, leaderboards and the cross-mode gate) |
| `game_progress` | Per-mode level, XP and cleared rounds at the current level |
| `achievements` | Earned badges (14 defined in `rounds.ACHIEVEMENTS`) |
| `daily_attempts` | One row per player per UTC day (primary key), bound to its round |
| `refresh_tokens` | Rotating refresh-token IDs with `used_at` for reuse detection |
| `user_identities` | Google / Apple identities (provider + stable subject) linked to a user; Apple refresh token kept for revocation |
| `schema_migrations` | One-off data migrations already applied |

## Appendix C: repository map

```
backend/
  server.py          app, auth + me + leaderboard routes, middleware
  auth.py            JWT cookies, refresh rotation, CSRF guard
  game_routes.py     every game mode's round lifecycle + resume
  daily_routes.py    Daily Cipher + /api/time
  rounds.py          round locking, idempotency, completion, XP, achievements
  economy.py         all scoring numbers, caps, pass rules
  match3_engine.py   server-side Match-3 (cascades, reshuffle, caps)
  ciphers.py         Caesar / Atbash / Vigenère / byte encodings
  content/           phrases, quiz, truefalse, binhex banks
  schema.sql, db.py  schema + migrations
frontend/src/
  games/             one component per mode
  pages/             dashboard, ranks, versus, profile, welcome
  components/        header, modals, toasts, nav, background, banner
  mobile/            keyboard, clock, haptics, layout, hooks, touch audit, tests
  glyphs/            custom icon set
  brand/             CipherMark + icon source
mobile/              Capacitor iOS + Android shells (see mobile/README.md)
tests/               backend regression suite
```

## Appendix D: how to verify the current state

```bash
backend/.venv/bin/python -m pytest tests -q          # expect 87 passed
cd frontend && CI=true yarn test --watchAll=false    # expect 35 passed
CI=true yarn build                                   # expect "Compiled successfully."
# with the dev server running:
open http://localhost:3000/device-lab.html           # pick a screen → "Run touch audit"
cd ../mobile && npm run sync && npx cap open ios     # or: npx cap open android
```
