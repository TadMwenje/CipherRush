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

## Provisioning (run it yourself)

1. Deploy the current backend first (Render → Manual sync). The startup schema
   adds the `is_review_account` column.
2. Copy the **External Database URL** from Render → `cipherrush-db` → Connect.
3. Run the script in a terminal. Don't save the URL in a file.

```sh
cd backend
read -rs DATABASE_URL && export DATABASE_URL   # paste the URL, press Enter
.venv/bin/python scripts/provision_review_account.py --username play_review --email play-review@aximoix.com
.venv/bin/python scripts/provision_review_account.py --username appstore_review --email appstore-review@aximoix.com
unset DATABASE_URL
```

The script asks you to type the database host to confirm. It prints a new
20-character password, which it never saves. Paste it into the store form,
then clear the terminal (`clear` and Cmd-K).

**To rotate a password,** run the same command again. It sets a new password
and signs out every existing session for that account. Rotate after each
review cycle, or if a password might have leaked. Then update the store form.

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
