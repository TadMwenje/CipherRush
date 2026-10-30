# Apple App Review: Guideline 2.1 – Information Needed

Submission `51ebdd81-259e-43bd-bf7e-e099d3c19d92`, iOS 1.0 (1.0.0, build 3),
message received 2026-10-30. Apple asks for a reply in App Store Connect **and**
the same text in App Review Information → Notes, for future submissions.

How to use this file:

1. Record the video (checklist at the bottom), upload it as an unlisted link
   (YouTube unlisted, iCloud Drive or Google Drive share link, "anyone with the
   link"), and replace `[INSERT_SCREEN_RECORDING_URL]` below.
2. Copy everything between the two lines into **Reply to App Review**, send it.
3. Paste the same text into the version's **App Review Information → Notes**
   (4,000-character limit: the reply below is about 3,600), Save, then
   **Resubmit to App Review**.

The reviewer password is **not** in this file (the repo is public). It lives
only in App Store Connect → Sign-In Information.

---

Hello App Review team,

Thank you for the review. Here is the information you asked for.

**1. Screen recording (physical device, latest iOS)**
[INSERT_SCREEN_RECORDING_URL]
Recorded on an iPad Pro 11-inch (4th generation) on iPadOS 26. It starts from launching the app and shows: sign-up of a new account, login with the demo account, the main game modes, a rewarded-video hint, and in-app account deletion (Profile → Delete account → type DELETE → Delete forever). CipherRush has no paid content or in-app purchases.

**2. Purpose and audience**
CipherRush is a free puzzle game that teaches practical cybersecurity basics through short arcade rounds: cracking classical ciphers (Caesar, Atbash, Vigenère), decoding binary and hex bytes, spotting phishing and scams in a quiz and true-or-false rounds, plus Match-3 and memory games with security themes and a Daily Cipher that everyone plays. It is for casual puzzle players, students and anyone who wants to recognise everyday online threats. Each round takes a minute or two and every quiz answer comes with a short explanation.

**3. How to access the app's features**
Demo account: handle `appstore_review` (the email address appstore-review@aximoix.com also works), with the password in the Sign-In Information field. It is already at level 2 with a few badges, so the profile and leaderboards aren't empty.
- Launch → Play → Log in with the demo account. You can also create an account (handle, email, password), or use Sign in with Apple or Google.
- Home lists every mode. Each game's "?" button opens a step-by-step walkthrough.
- Hints: in Cipher Puzzles, a hint costs 20% of the round's points, or watching an optional rewarded video makes it free. The Security Quiz gives 3 free hints a round, then offers a rewarded video for another.
- Profile → Delete account permanently deletes the account and its data. For Sign in with Apple accounts it also revokes the Apple token.
- "Practice without an account" on the welcome screen works offline, with no login needed.
No sample files or special hardware are needed.

**4. External services**
- Our own API at api.aximoix.com (hosted on Render, with a PostgreSQL database, behind Cloudflare). It handles accounts, scoring and leaderboards. All scoring is done on the server.
- Sign in with Apple and Google Sign-In (optional login methods).
- Google AdMob, which serves rewarded videos and occasional interstitials between rounds. Ads are non-personalised, we don't track users across apps, and Google's consent form (UMP) is shown where required (EEA, UK, Switzerland). Rewards are granted only after AdMob's server-side verification callback.
- Zoho ZeptoMail, which sends email-verification codes and password-reset emails.
No payment processors and no AI services are used.

**5. Regional differences**
The app works the same in every region where it's available. The only difference is Google's ad-consent prompt, which by law appears in the EEA, UK and Switzerland. Game content is in English.

**6. Regulated industry and third-party material**
CipherRush is not in a regulated industry. All game content (ciphers, quiz questions, artwork and icons) was written or made by AximoIX, the publisher, and contains no third-party copyrighted material. The ciphers it uses are historical and public domain.

User-generated content: the only user-generated content is the player's handle, which appears on leaderboards. Handles are checked against a profanity and hate-speech filter when they are created or changed. There is no chat, messaging or uploaded content.

Thank you,
AximoIX

---

## Recording checklist (iPad, Control Center → Screen Recording)

Charge the iPad first. Turn on Do Not Disturb so notifications stay out of the
video. Keep the whole recording under about 4 minutes.

1. Start recording on the Home Screen, then tap the CipherRush icon (Apple
   wants the launch).
2. Play → **Make one**: create a fresh account (for example `demo_delete_1`,
   any email you can check). This shows registration.
3. Home → Cipher Puzzles → tap **?** → step through the walkthrough → close →
   solve or attempt one cipher.
4. Tap **Hint** → choose the rewarded-video hint (the App
   Store build serves live ads; a "test ad" label is fine in a debug build)
   → close the video → the hint appears.
5. Security Quiz → use a hint (one option is struck out).
6. Ranks tab (leaderboards), Profile tab.
7. Profile → **Delete account** → type DELETE → **Delete forever** → the app
   returns to the welcome screen.
8. Log in with the demo account `appstore_review` to show the demo login works.
   Type the password with the keyboard off-screen, or blur it in the
   edit: the video link is shared with Apple only, but keep it unlisted.
9. Stop recording.
