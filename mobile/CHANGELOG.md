# CipherRush apps: changelog

Native app changes (Android and iOS). Server and web changes are in git history.

## Android 1.0.0 (4), 29 Oct 2026

### Fixed
- **App icon (Android):** the launcher icon was still Capacitor's placeholder
  (a blue "X" on white). Since 21 Oct only iOS had the CipherMark icon. Android
  now uses the same artwork:
  - adaptive icon: the CipherMark on `#0A0E1A`, inside the 66dp safe zone;
  - legacy square and round icons for Android 7.x;
  - splash images for Android 11 and older;
  - a dark Android 12+ splash background.

  Regenerate with `mobile/scripts/android-assets.sh`.
- **Google sign-in from Play installs (Android):** Play re-signs every install
  with its app signing key, and Google Cloud had no Android OAuth client for
  that key's SHA-1. Only the upload and debug keys were registered, so sign-in
  failed with a developer/configuration error for every tester. Added the
  client "CipherRush Android (Play app signing)" for SHA-1
  `B5:1C:08:56:08:0D:0A:D7:5F:EF:FB:52:1B:1E:EB:42:AE:A5:B7:31`. This was a
  console change only; no app change was needed.
- **OAuth consent screen:** the privacy policy URL had a pasted Markdown link
  in it, and the home page was empty. Both are corrected. The screen is still
  in Testing (only listed test users can sign in with Google, on both
  platforms) until it's published; see `store/google-play.md`.

### Checked, no change needed
- iOS: the app icon (1024 universal) and splash were already the CipherMark.
  The Google URL scheme (reversed iOS client ID), the Sign in with Apple
  entitlement and the server audiences are consistent.
- There's no `google-services.json` or `GoogleService-Info.plist`. That's
  expected: sign-in uses Credential Manager (Android) and Google Sign-In
  (iOS) through `@capgo/capacitor-social-login`, not Firebase.

## Android 1.0.0 (3), 28 Oct 2026
- Google AdMob ads: rewarded hints and extra moves, opt-in double points, and
  interstitials between rounds. Rewards are verified server-side.
