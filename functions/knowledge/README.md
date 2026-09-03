# MidiAI Studio Product Knowledge Base

Customer-support RAG knowledge. **Not** raw app source and **not** fine-tuning data.

## Layers

| Layer | Used by | Filter |
|-------|---------|--------|
| `publicSeed.js` | Customer Support AI | `visibility=public`, `active`, `verification=verified` |
| `internalSeed.js` | Admin/handoff helpers only | `visibility=internal` (+ public) |
| `needsReview.js` | Never auto-retrieved | `verification=needs_review` or `active=false` |

## Rules

- Facts only from production site guides, product CMS seeds, purchase UI, downloads copy, support flows.
- Windows app binary/source is **not** in this repo → do not invent CUDA/ffmpeg/yt-dlp internals.
- Never store secrets, tokens, keys, user PII, or bypass instructions.
- Prefer updating guides/FAQ/product CMS; then refresh seeds (do not invent a second CMS unless needed).

## Retrieval

`require('./knowledge').retrieve(question, { visibility: 'public' | 'internal' })`

## Stale / future Cursor checklist

When changing product behavior, ask: **Does AI Knowledge need an update?**  
If yes → update seed or mark `needs_review`. See `/docs/AI_PRODUCT_KNOWLEDGE.md`.
