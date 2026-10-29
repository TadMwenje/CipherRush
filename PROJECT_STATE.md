# CipherRush: Project State

Single source of truth for what CipherRush is, how it's built, what has been done, what's still open, and what comes next.

| | |
| --- | --- |
| **Last updated** | 2026-10-29 |
| **Branch** | `ios-device-testing`, pushed to GitHub (`TadMwenje/CipherRush`) |
| **Test status** | 195 backend tests · 154 frontend tests · strict production build clean |
| **Native builds** | iOS 1.0.0 (2) uploaded to App Store Connect · Android 1.0.0 (4) signed AAB, (3) in Play closed testing |
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
- **AdMob audit (2026-10-29):** account under verification; payment profile complete (AdSense Zimbabwe, US$100 threshold); identity verification not requested yet (it comes at the earnings threshold). Both apps "Requires review / limited ad serving" until linked to a live store listing (AdMob → Apps → Add shop, possible once the app is public on Play / the App Store). All six ad units in AdMob match `ads/config.js`, the native app IDs and `ads.py`.
- **Still open:**
  - Deploy `3de450a` on Render (Manual Deploy → Deploy latest commit).
  - Google OAuth consent screen is in Testing (only listed test users can use Google sign-in); publish it.
  - `app-ads.txt` on aximoix.com: still 404. Add `public/app-ads.txt` to the `AximoIX-website-main` repo (GitHub Pages serves `public/`).
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
