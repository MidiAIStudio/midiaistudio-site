# Functions codebase: `web`

Firebase project: `midiaistudio`

This repo deploys **only** codebase `web` (see `../firebase.json`).

```bat
cd C:\GitHub\midiaistudio-site
firebase deploy --only functions
```

or:

```bat
firebase deploy --only functions:web
```

That cannot delete or overwrite MidiAI codebase `python`
(getCreditBalance, authorizeConversionJob, failConversionJob, …).

Do not export these names from `index.js`:

- getCreditBalance / getPointBalance
- listCreditLedger / listPointLedger
- authorizeConversionJob / startConversionJob / completeConversionJob / failConversionJob
- refundStalePointJobs
- capturePayPalCreditOrder / capturePayPalPointOrder (Python credit PayPal)

Node-owned (this codebase) admin alerts:

- `notifyAdminOnInquiryCreate` / `notifyAdminOnHumanRequest` / `notifyAdminOnOrderCompleted`
  — Kakao Talk admin alerts (replaces retired Discord notify* functions).
- `kakaoOAuthCallback` / `testKakaoAdminNotification` — OAuth + connectivity test.
  Named deploy example:
  `firebase deploy --only functions:web:notifyAdminOnInquiryCreate,functions:web:notifyAdminOnHumanRequest,functions:web:notifyAdminOnOrderCompleted`

Wallet display on the website still calls the same public URL
`.../getCreditBalance`. Python owns that function.

Full map: `C:\MidiAI\firebase\FUNCTION_OWNERSHIP.md`
