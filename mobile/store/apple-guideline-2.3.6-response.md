# Apple Guideline 2.3.6 (Accurate Metadata): response

Rejection received 2026-11-11 for iOS 1.0 (build 3), submission
`51ebdd81-259e-43bd-bf7e-e099d3c19d92`, reviewed on an iPad Air 11-inch (M3).

Apple's finding: the Age Rating questionnaire said the app has In-App
Controls, but the reviewer found no Parental Controls or Age Assurance.

## What was changed (2026-11-11)

App Store Connect → App Information → Age Ratings → Step 1 (Features):

| Question | Before | After |
| --- | --- | --- |
| Parental Controls | Yes | **No** |
| Age Assurance | No | No |
| Advertising (Capabilities) | No | **Yes** (AdMob rewarded videos and interstitials) |

Everything else was left as it was. The calculated rating is still 4+.
No new build is needed; these are metadata changes.

## Reply to send in App Review (Resolution Center)

> Hello App Review team,
>
> Thank you for your feedback on Guideline 2.3.6.
>
> You are right: CipherRush does not include Parental Controls, a parental
> gate, or any Age Assurance mechanism. The "Parental Controls" answer in the
> Age Rating questionnaire was selected by mistake.
>
> We have updated the Age Rating questionnaire on the App Information page.
> Parental Controls is now set to "No" (none), and Age Assurance is also "No".
> While reviewing the questionnaire we also corrected "Advertising" to "Yes",
> because the app shows Google AdMob ads (optional rewarded videos and
> occasional interstitials between rounds).
>
> The calculated age rating is unchanged at 4+. The app binary has not
> changed, so we have resubmitted the same build, 1.0 (3).
>
> Thank you for reviewing CipherRush.
>
> Kind regards,
> AximoIX

## Status

- 2026-11-11: Advertising set to Yes and saved (checked by reopening the
  questionnaire).
- 2026-11-11: the reply above was sent in App Review (the submission now
  shows 4 messages).
- Still to do: resubmit. On the submission page "Resubmit to App Review" is
  greyed out. Open the version (Distribution → iOS App 1.0, or "Edit" on the
  submission item), click **Update Review**, then confirm the resubmission.
