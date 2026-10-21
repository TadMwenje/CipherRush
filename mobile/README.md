# CipherRush mobile (iOS + Android)

Native shells built with [Capacitor 8](https://capacitorjs.com). They wrap the React app in `../frontend` - there is no separate mobile codebase. Fix a bug in `frontend/`, run `npm run sync`, and both apps pick it up.

```
mobile/
├── capacitor.config.json   app id, name, web dir, native HTTP/cookies
├── ios/                     Xcode project (Swift Package Manager - no CocoaPods)
└── android/                 Android Studio / Gradle project
```

## First time after cloning

You need Node 20+, plus Xcode (iOS) and/or Android Studio (Android).

```bash
cd frontend && yarn install && cd ..
cd mobile && npm install
```

## Day-to-day

```bash
# Build the web app and copy it into both native projects
REACT_APP_BACKEND_URL=<api url> npm run sync

npm run ios        # sync + open Xcode       (then press Run)
npm run android    # sync + open Android Studio
npm run run:ios    # sync + run on a simulator/device from the terminal
npm run run:android
```

`REACT_APP_BACKEND_URL` is baked into the build, so set it for the target you're running:

| Running on | API URL |
| --- | --- |
| iOS simulator | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` (the emulator's alias for your computer) |
| Real phone over USB (Android) | `http://localhost:8000` after `adb reverse tcp:8000 tcp:8000` |
| Real phone on Wi-Fi | `http://<your computer's LAN IP>:8000` (start uvicorn with `--host 0.0.0.0`) |
| Release builds | your HTTPS API (served from an aximoix.com subdomain, for example) |

Plain `http://` only works in development: iOS allows local-network addresses (`NSAllowsLocalNetworking`), and Android allows `10.0.2.2` / `localhost` in **debug builds only** (`android/app/src/debug/`). Release builds are HTTPS-only.

## How login works inside the app

The web app uses httpOnly cookies for sessions. Inside a native shell the page runs on `capacitor://localhost` (iOS) or `https://localhost` (Android), which makes every API call cross-site, and WebKit would drop the cookies. `capacitor.config.json` enables **CapacitorHttp** and **CapacitorCookies**, so requests go through the phone's native networking with a native cookie store. The same session, refresh-token and CSRF logic works unchanged.

For production, run the API on HTTPS and set `COOKIE_SECURE=true` in `backend/.env`.

## Sign in with Google and Apple

The app gets an ID token from Google or Apple and sends it to the backend (`POST /api/auth/google` / `/api/auth/apple`), which verifies the signature, issuer, expiry and **audience** before creating a session. No client secret is ever in the app. The buttons stay hidden until both the backend and the app build are configured.

**Status (2026-10-21):** Google Cloud project `cipherrush-auth`. The **iOS** client (`548808788960-3jtmc07…`) is live: its ID is in `frontend/.env.production`, the backend's `GOOGLE_CLIENT_IDS`, and its reversed ID is registered as a URL scheme in `Info.plist`. The **Android** client (`548808788960-nq95sgd…`) exists, but Android also needs a **Web** client ID, which hasn't been created yet, so the Google button stays hidden on Android. The debug keystore SHA-1 on the main dev Mac is `64:D3:D4:68:41:95:DE:69:B2:92:50:F8:8C:08:57:D2:F7:15:93:8A`.

The client IDs are public and committed in `frontend/.env.production`. The JSON/plist files Google lets you download are gitignored; don't commit them.

**Google (Google Cloud Console, one project):**

1. OAuth consent screen: app name *CipherRush*, publisher *AximoIX*, privacy policy `https://aximoix.com/privacy/`, terms `https://aximoix.com/terms/`, authorised domain `aximoix.com`.
2. **Web** client ID → `REACT_APP_GOOGLE_WEB_CLIENT_ID` (frontend) and into `GOOGLE_CLIENT_IDS` (backend). Android uses this same ID as its server client ID. Add your web origins (and `http://localhost:3000` for dev) as authorised JavaScript origins.
3. **iOS** client ID for bundle `com.aximoix.cipherrush` → `REACT_APP_GOOGLE_IOS_CLIENT_ID`, and add it to `GOOGLE_CLIENT_IDS` too (iOS tokens carry the iOS client ID as their audience). Then add its *reversed* client ID (`com.googleusercontent.apps.…`) as a URL scheme in `ios/App/App/Info.plist` → `CFBundleURLTypes`. The Google SDK needs it to return to the app.
4. **Android** client ID for package `com.aximoix.cipherrush` with the SHA-1 of your debug and release keystores (`./gradlew signingReport`). Nothing goes in code for this one, but sign-in fails without it.

**Apple (developer.apple.com):**

1. App ID `com.aximoix.cipherrush` with the *Sign in with Apple* capability. The entitlement is already in `ios/App/App/App.entitlements`.
2. Backend `APPLE_CLIENT_IDS=com.aximoix.cipherrush` (plus the web Services ID below, if used).
3. A *Sign in with Apple* key (Keys section) → backend `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. **Server only.** It's used to revoke a player's Apple tokens when they delete their account, which App Review requires.
4. Optional, Apple on the web: a Services ID (e.g. `com.aximoix.cipherrush.web`) with your https domain and return URL → `REACT_APP_APPLE_SERVICE_ID`, `REACT_APP_APPLE_REDIRECT_URI`, and add it to `APPLE_CLIENT_IDS`.

The Apple button shows on iOS and the web. Apple only requires it where other social logins are offered on iOS, and the Android flow needs an extra web redirect.

## Legal, privacy and store listings

CipherRush's legal terms are AximoIX's, maintained on aximoix.com (in a separate repo):

| Store field | URL |
| --- | --- |
| Privacy policy | `https://aximoix.com/privacy/` (CipherRush section: `#cipherrush`) |
| Terms / EULA | `https://aximoix.com/terms/` (CipherRush section: `#cipherrush`) |
| Account deletion (Google Play) | `https://aximoix.com/privacy/#cipherrush-delete` |

In-app, the links open in the system's in-app browser (`@capacitor/browser`). Players can delete their account in *Profile → Delete account*. The app collects no location, contacts or advertising identifiers and has no ads or third-party trackers, so on Apple's privacy labels the only "data linked to you" is the email address, user ID and gameplay data, used for app functionality.

## Things that are already set up

- **Orientation:** portrait and both landscapes on phones, all four on iPad; Android follows the sensor without restarting the WebView.
- **Safe areas:** the web app pads for notches, the Dynamic Island and gesture bars (`viewport-fit=cover`).
- **Haptics:** `@capacitor/haptics` is installed; `frontend/src/mobile/haptics.js` uses it automatically inside the app.
- **Keyboard:** handled in the web layer (`frontend/src/mobile/keyboard.js`).

## Before the first store release

- The app ID is `com.aximoix.cipherrush` on both platforms (AximoIX is the publisher). It's permanent once published.
- Set the team / signing identity in Xcode and a release keystore in Android Studio.
- App icons and splash: the source artwork is `frontend/src/brand/icon-source.svg`. Generate native sizes with `npx @capacitor/assets generate` (see Capacitor docs).
