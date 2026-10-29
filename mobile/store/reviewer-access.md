# Store review accounts

Google Play and Apple each get their own review account on the live API
(`https://api.aximoix.com`).

**Credentials never go in this file.** The repo is public. The password is
printed once by the provisioning script, and you paste it straight into the
store's own form:
- Play Console: App content → App access
- App Store Connect: App Review Information → Sign-in information

| Store | Username | Email |
| --- | --- | --- |
| Google Play | `play_review` | play-review@aximoix.com |
| Apple App Store | `appstore_review` | appstore-review@aximoix.com |

The emails are only contact addresses on the account. CipherRush never emails
them or asks reviewers to verify them, so they don't need to be real mailboxes.
If you'd rather receive mail at them, point them at hello@aximoix.com in your
email host.

## What these accounts are

- **Ordinary players.** CipherRush has no roles, admin rights or internal
  tools reachable from an account. A review account can only do what any
  player can do.
- **Off the leaderboards.** They're flagged `is_review_account`. They never
  appear on the all-time, Rush or Daily boards, never earn the top-10 badge,
  and never push a real player down the ranks. CipherRush has no analytics or
  telemetry, so there's nothing else to exclude them from.
- **Same rate limits as everyone.** Login is limited to 10/min and sign-up to
  5/min per IP, along with the game endpoints' own limits. This is enforced
  through the Cloudflare client IP.
- **No OTP or phone check.** CipherRush has no 2-step verification, so
  reviewers just enter a handle and password.
- **Sample progress.** Account level 2 (1,500 points, halfway to level 3) with
  the First Steps and First Decrypt badges, so Profile and Ranks aren't empty.
  Per-mode levels start at 1, and reviewers can play any mode.

## Provisioning from Render (simplest)

The server creates or repairs both accounts every time it starts, from two
environment variables. Use this when you already have the passwords you typed
into the store forms:

1. Render → `cipherrush-api` → **Environment** → add (paste the values
   yourself; never commit them):
   - `REVIEW_PLAY_PASSWORD`: the Play reviewer's password
   - `REVIEW_APPSTORE_PASSWORD`: the App Store reviewer's password
2. Save, then **Manual Deploy → Deploy latest commit** (needs `review_accounts.py`
   in the deployed commit).
3. On start, each account is created if missing, or its password set to the
   variable's value if it differs. A password that already matches is left
   alone, so restarts don't sign reviewers out. It never touches a handle
   owned by a real player. The values must meet the app's password rule
   (8+ characters with lower case, upper case and a digit).

To rotate a password later, change the variable and redeploy, then update the
store form.

## Provisioning (run it yourself)

1. The backend with `is_review_account` is deployed (`c92d32d`, 2026-10-28).
2. Copy the **External Database URL** from Render → `cipherrush-db` → Connect.
3. Run one command. It has no prompts. It creates (or resets) both accounts,
   checks each one can log in to the live API, then writes the passwords to
   `mobile/store/REVIEWER_CREDENTIALS.txt`:

```sh
cd ~/Developer/CipherRush/backend
read -rs DATABASE_URL && export DATABASE_URL   # paste the URL, press Enter (hidden)
.venv/bin/python scripts/provision_review_account.py --yes \
    --verify-api https://api.aximoix.com \
    --credentials-file ../mobile/store/REVIEWER_CREDENTIALS.txt
unset DATABASE_URL
```

`REVIEWER_CREDENTIALS.txt` is gitignored and readable only by you (mode 600).
The script refuses to write to any path git would track. If a login check
fails, nothing is written. Running it again rotates both passwords and signs
out existing sessions; use `--store play` or `--store appstore` to rotate just
one.

4. Copy each account into its store form:
   - Play Console → App content → **App access** → "All or some functionality
     is restricted" → add instructions: username `play_review`, its password,
     and the review notes below.
   - App Store Connect → the app version → **App Review Information** →
     Sign-in required: username `appstore_review`, its password, and the notes
     below.
5. Once both are entered, delete the file or move it into your password
   manager. The stores keep their own copy.

## Instructions to paste into the store's review notes

> 1. Open CipherRush.
> 2. Tap **Play**. The **Log in** form opens.
> 3. Enter the **Handle** and **Password** given above, then tap **Log in**.
>
> No one-time code, email confirmation or phone verification is needed. Every
> game mode is available from the home screen. Practice Mode (on the welcome
> screen) also works without signing in or a connection.
>
> Accounts can be deleted in Profile → Delete account. Please don't delete this
> review account; it is reused for future reviews.

The first sign-in after a quiet spell can take up to a minute while the server
wakes (free Render plan, see O-15). Move the API to a paid plan before
submitting, or reviewers may report the app as broken.
