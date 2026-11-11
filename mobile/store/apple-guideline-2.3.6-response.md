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

Everything else was left as it was. The calculated rating is still 4+.
No new build is needed; this is a metadata change.

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
> The calculated age rating is unchanged at 4+. No other part of the app or
> its metadata has changed, so we have resubmitted the same build, 1.0 (3).
>
> Thank you for reviewing CipherRush.
>
> Kind regards,
> AximoIX

## Steps to finish

1. App Review → the submission → **Reply to App Review**, paste the reply
   above, and send it.
2. Click **Resubmit to App Review** on the same page.
