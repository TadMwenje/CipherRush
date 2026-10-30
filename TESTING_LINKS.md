# CipherRush: links for testers

Checked 2026-10-30 in Play Console and App Store Connect.

## Android (Google Play closed testing, track "Closed testing - Alpha")

| | |
| --- | --- |
| Track | Active. Latest release 5 (1.0.0), 178 countries/regions |
| Who can join | Email list **test1** (3 addresses), ticked for this track. No Google Group |
| Join on the web | https://play.google.com/apps/testing/com.aximoix.cipherrush |
| Join on Android | https://play.google.com/store/apps/details?id=com.aximoix.cipherrush |

**Before sharing:** add the tester's Google account email to **test1** (Play Console →
Testing → Closed testing → Alpha → Testers → test1 → add → Save). Anyone not on
the list sees "app not available" or a 404, and the Android link 404s for anyone
signed out or not yet opted in. That's expected.

Tester steps:
1. Open the web link while signed in to the listed Google account → **Become a tester**.
2. Tap "download it on Google Play" (or the Android link) → Install. The first
   install can take a few minutes to appear after opting in.

## iOS (TestFlight external testing)

| | |
| --- | --- |
| Group | **external** (External Testing), 1 build: 1.0.0 (3) |
| Public link | https://testflight.apple.com/join/gyxtrtHv |
| Tester limit | 1 of 10 used (one anonymous tester installed 1.0.0 (3) on 2026-10-30) |

Tester steps:
1. Install **TestFlight** from the App Store on the iPhone or iPad.
2. Open the public link on that device → Accept → Install.

The limit is 10 testers. Raise it in TestFlight → external → Public Link → Manage
(up to 10,000).

## App Store (after approval)

https://apps.apple.com/app/id6828379997. This returns 404 until Apple approves
version 1.0 (it is in review now) and it is released.

## Review accounts (store reviewers only)

`play_review` and `appstore_review`. Passwords are only in the store consoles
and on Render. Never share them with testers (see
`mobile/store/reviewer-access.md`).
