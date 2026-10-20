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
| Release builds | your HTTPS API, e.g. `https://api.cipherrush.app` |

Plain `http://` only works in development: iOS allows local-network addresses (`NSAllowsLocalNetworking`), and Android allows `10.0.2.2` / `localhost` in **debug builds only** (`android/app/src/debug/`). Release builds are HTTPS-only.

## How login works inside the app

The web app uses httpOnly cookies for sessions. Inside a native shell the page runs on `capacitor://localhost` (iOS) or `https://localhost` (Android), which makes every API call cross-site, and WebKit would drop the cookies. `capacitor.config.json` enables **CapacitorHttp** and **CapacitorCookies**, so requests go through the phone's native networking with a native cookie store. The same session, refresh-token and CSRF logic works unchanged.

For production, run the API on HTTPS and set `COOKIE_SECURE=true` in `backend/.env`.

## Things that are already set up

- **Orientation:** portrait and both landscapes on phones, all four on iPad; Android follows the sensor without restarting the WebView.
- **Safe areas:** the web app pads for notches, the Dynamic Island and gesture bars (`viewport-fit=cover`).
- **Haptics:** `@capacitor/haptics` is installed; `frontend/src/mobile/haptics.js` uses it automatically inside the app.
- **Keyboard:** handled in the web layer (`frontend/src/mobile/keyboard.js`).

## Before the first store release

- Change `appId` (`com.cipherrush.app`) if you own a different domain. It's permanent once published.
- Set the team / signing identity in Xcode and a release keystore in Android Studio.
- App icons and splash: the source artwork is `frontend/src/brand/icon-source.svg`. Generate native sizes with `npx @capacitor/assets generate` (see Capacitor docs).
