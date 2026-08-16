# Production hosting

## Source of truth

```text
Production:  https://midiaistudio.com  →  GitHub Pages
Preview only: https://midiaistudio.web.app (Firebase Hosting, not Search Console production)
App backend: Firebase Auth / Firestore / Storage / Functions
Source:      this GitHub repository

Do NOT point midiaistudio.com at Firebase Hosting.
Do NOT change Cloudflare DNS for a Hosting cutover.
```

Production deploy flow:

```text
edit source → commit → push to the GitHub Pages branch already used for midiaistudio.com
```

Pretty Guide URLs are **directories** so GitHub Pages serves them without rewrites:

```text
/guide/youtube-to-midi/  →  guide/youtube-to-midi/index.html
```

Canonical host: `https://midiaistudio.com`

Firebase `firebase.json` rewrites exist only so `web.app` preview stays consistent. They are not the production routing mechanism.
