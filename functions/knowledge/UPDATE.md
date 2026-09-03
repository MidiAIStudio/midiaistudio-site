# MidiAI Studio Knowledge update workflow

When app (`C:\\MidiAI`) or website (`midiaistudio-site`) user-facing behavior changes, ask:

**Does this change require AI Knowledge update?**

- YES → update matching docs under `functions/knowledge/public` or `internal`, then re-run `node functions/knowledge/auditStale.js --write-baseline`
- UNSURE → add/keep `verification: "needs_review"` and `active: false`
- NO → note in PR why Knowledge is unaffected

## Bundle policy (current scale ~28 docs)

Keep JSON under `functions/knowledge/*.json` in the Functions bundle (simple/cheap).

**Functions redeploy is required** when Knowledge JSON changes (bundle copy).

Runtime authoritative (do **not** hardcode as sole SoT in JSON):

- **FAQ** → Firestore `faq` live retrieval in `supportAi.js`
- **Prices / sellable products** → Firestore `products` live catalog passages

Guide HTML / product copy changes → run stale audit; do **not** blind auto-publish.

```bash
node functions/knowledge/auditStale.js
# after intentional Knowledge update:
node functions/knowledge/auditStale.js --write-baseline
```

STALE report: `functions/knowledge/audit-report.json`

## Rules
- Never paste secrets, tokens, service accounts, or private keys into Knowledge.
- Public Support AI may retrieve only `visibility: public` + `verification: verified` + `active: true`.
- Do not invent formats, prices, or error fixes not confirmed in current sources.
- Prefer `/guide/` + current app `lang/*.json` + production product copy over SEO `/guides/` articles.
- Preview/Beta features must keep `featureStatus` accurate.

## Source priority
1. Production behavior / structured product data (live)
2. Current app user-facing strings & flows
3. Official `/guide/`
4. FAQ (live Firestore) / notices / patch notes
5. SEO `/guides/` (secondary)
