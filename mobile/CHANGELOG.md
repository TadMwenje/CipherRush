# CipherRush apps: changelog

Native app changes (Android and iOS). Server and web changes are in git history.

## Android 1.0.2 (7) and iOS 1.0.2 (5), not yet released

Fixes from the 1.0.1 phone check. Works with the server that is live now.
Deploy the matching server (branch `v1.0.2`) to get the stricter handle
rules on the server side too; the app checks handles itself first.

### Fixed
- **Translations everywhere:** all eight games, Practice, Versus, the account
  section, sign-in, the reminder card, toasts, the share sheet and the
  leaderboard rows ("Level 3 · 12 games") now follow the app language. No
  more English in a French app. Puzzles, quiz questions and messages written
  by the server are still in English.
- **Offline banner:** sits below the status bar and pushes the screen down,
  so it no longer covers titles or the back button. It says "Offline.
  Showing your saved stats." on menus and "Offline. Your round will sync when
  you're back." only during a round.
- **Tutorial sheet:** keeps the same height on every step instead of jumping,
  and the last button ("Recommencer", "Von vorn") no longer gets cut off.
- **Numbers and dates:** scores use the app language's number format
  everywhere, and dates read "23 Nov 2026".
- **Handle field:** full width with Save underneath, so a 20-character handle
  shows in full.
- **Cipher names and hints:** "César", "Cezar" and so on, and the free hint
  under each cipher, follow the app language.

### Added
- **Music and sound:** every game has its own quiet background loop, made by
  the app itself (no audio files, about 4 KB): a calm arpeggio with a clock
  tick for Cipher Puzzles and the Daily Cipher, a driving pulse for Speed
  Rush that speeds up in the last 15 seconds, digital bleeps for
  Binary / Hex, a warm pad for the Security Quiz, a game-show pulse for
  True or False, a marimba tune for Match-3 and Memory Lock, and a duel beat
  for Versus. Practice uses the matching loop. New effects for taps and key
  presses, hints, the last 10 seconds of a clock and levelling up; correct
  answers climb in pitch with a combo or streak, and wrong answers are a
  softer buzz.
- **Speaker button** in every game header and in Versus: mute, music on/off,
  sound effects on/off and volume, without leaving the round. Profile >
  Preferences has the same Music, Sound effects and Volume controls, and the
  two always match. The phone's volume buttons work as usual.
- Sound stops while the app is in the background or a video ad is playing,
  and comes back afterwards.
- **iPhone:** game sound plays even with the silent switch on, and mixes with
  music or podcasts from other apps instead of stopping them. Use the speaker
  button or the volume buttons to quieten it.

### Changed
- **Profile, in four cards:** who you are (handle, level, score, member
  since), Preferences (language, music, sound effects, volume, vibration,
  Daily Cipher reminders),
  Account and data (sign-in, password, your data, clear saved data, legal),
  and the danger zone (log out, delete account) at the very bottom.
- **Vibration switch:** new; the choice stays on this phone.
- **Clear saved data:** removes the offline copies of stats and boards; you
  stay signed in.
- **Handles:** swapped letters (adlof, htiler, osmaa) and extremist and
  terror names are refused, and `_ . -` no longer hide a word. Ordinary words
  like godot, sussex, callahan, abdallah and grapefruit still work.
- **Copy:** shorter and plainer wording across all eight languages.

## Android 1.0.1 (6) and iOS 1.0.1 (4), 23 Nov 2026

Works with the server that is live now. Deploy the matching server (branch
`v1.0.1`) to get the new handle rules and gzipped responses; the app doesn't
depend on either.

### Added
- **Game cards:** every home-screen mode is a card with a small animated
  preview of its gameplay and its own ? button. Every mode now has a 3-step
  walkthrough: Security Quiz, True or False, Match-3 and Memory Lock are new,
  and Rush and Binary/Hex each gained a step.
- **Languages:** English, Español, Français, Deutsch, Português, Italiano,
  Nederlands and Polski, picked under Profile > Language. The default follows
  the phone. It covers menus, the home screen, rules, walkthroughs, profile and
  ranks. Puzzles and quiz questions stay in English.
- **Low-data startup:** home stats, the Daily status, ranks and profile show
  the last copy at once and refresh in the background. A returning player
  skips the wait on a sleeping server. Duplicate requests are shared, and
  server responses are gzipped.

### Changed
- **Handles:** more names are refused, including religious figures,
  extremists, brands and "sex". Leetspeak is caught. The new message is
  "That username isn't available. Please choose another."
- **Copy:** calmer, skill-focused taglines ("Verify before you trust",
  "Test your cyber instincts", "Spot the pattern. Decode the signal.").

### Fixed
- **Android status bar:** the Daily Cipher banner no longer sits under the
  status bar on edge-to-edge Android (Capacitor's inset variables are used
  when the WebView reports `env()` as 0).

## Android 1.0.0 (5) and iOS 1.0.0 (3), 29 Oct 2026

Needs the matching server (commit `3de450a`) deployed first.

### Added
- **How to Play walkthroughs:** a game's ? button now opens a step-by-step
  walkthrough for Cipher Puzzles, Daily Cipher, Speed Cipher Rush and
  Binary/Hex. Each step has a worked example on letter tiles (Caesar, Atbash,
  Vigenère, ROT-13, hex and binary bytes) and a strategy tip, followed by the
  quick rules.
- **Security Quiz hints:** a hint rules out one wrong answer, down to two
  options. Three a round are free. After that, a rewarded video buys another,
  verified by AdMob server-side verification like the Cipher hint. Hints cost
  no points.

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
