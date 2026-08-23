# Price source-of-truth fix — Admin edit not reflected on purchase/quote
# Date: 2026-08-23

## VERDICT

**PASS (code path)** — Firestore `products` is the only operational price SoT across Admin → hydrate → Purchase UI → `createPurchaseQuote` → PortOne verify.

**E2E live write SKIPPED** — no Google Application Credentials / firebase-admin in this environment. Offline hydrate/quote path tests PASS. Live `getPublicCatalog` currently returns policy prices (7.9k / 19.9k / 49.9k / 129k).

Deploy required for production: Hosting (JS) + Node `functions` (`loadRegionCharge`) + Python `catalog_store` (already local-fixed).

---

## ROOT CAUSE

1. **Purchase UI** applied Firestore catalog in `refreshPricingUi` but did **not** re-render plan cards → seed fallback prices (19900…) stayed on screen.
2. **Hydrate / ensureSeed** previously forced Lifetime `130000 → 129000`, overwriting admin-editable prices.
3. **Pass `saveDraft`** often wrote `listPriceKrw` only; quote/`loadRegionCharge` could still read stale `regions.KR.listPrice` / `salePrice`, and legacy campaign promo could keep an old sale amount.
4. **Invalid charge on existing docs** could fall back to env Lifetime amount (removed — now `PRICE_INVALID`).

---

## PRICE SOURCES FOUND

| File | Values | Role |
|------|--------|------|
| `assets/js/catalog-engine.js` SEED | 7900 / 19900 / 49900 / 129000 | Create-missing + offline fallback only |
| `functions/catalogEngine.js` SEED | same | Server seed / hydrate fill for **missing** fields |
| `assets/js/pricing.js` FALLBACK | Lifetime 129000 | No-Firestore display fallback |
| `assets/js/config.js` `priceValueKr` | 129000 | Legacy Lifetime UI fallback |
| `assets/js/pass-catalog.js` FALLBACK | from SEED | Offline UI until Firestore maps |
| `MidiAI/.../catalog_store.py` | seed + hydrate | Python public catalog |
| Purchase hardcodes in app | CONFIG.priceValueKr | Lifetime-only legacy path |

Operational SoT after fix: **Firestore `products/{id}.listPriceKrw`** (+ synced `regions.KR`).

---

## SOURCE OF TRUTH

운영 가격: **Firestore `products`**

```
Admin save → Firestore → Purchase UI (ensurePricing) → createPurchaseQuote(loadRegionCharge) → verifyPortOne(quote.finalPrice)
```

---

## SEED

기존: missing create + Lifetime rewrite / credit pause  
수정 후: **missing docs only**; existing prices never rewritten; CREDIT_* pause-only remains

---

## HYDRATE

기존: nullish → seed; Lifetime 130k→129k force  
수정 후: doc `listPriceKrw` → else `regions.KR.listPrice` → else seed; **no price force-correct**

---

## ADMIN SAVE

write: `listPriceKrw` + Pass/Lifetime `regions.KR.listPrice/salePrice` sync  
read-back: `getDoc` must equal draft price or throw (no false success)

---

## PURCHASE

source: Firestore via `ensurePricing` → `applyPublicPassCatalog` (`cacheSource=firestore`)  
cache: memory only; refetch every `ensurePricing`; `CATALOG_FALLBACK_USED` if seed used  
re-render: `applyPurchaseModeUi` after catalog load; `initPurchasePoints` awaits refresh

---

## QUOTE

source: `loadRegionCharge` → hydrate → `computeCharge` from Firestore  
amount: `product.amount` / quote `finalPrice`  
client amount ignored  
stale `regions.KR` ignored unless aligned with `listPriceKrw`

---

## PAYMENT VERIFY

expected amount: `quote.finalPrice` when quote valid, else catalog `product.amount`  
paid ≠ expected → REJECT

---

## E2E

| Product | Logic path (edit→quote→restore) | Live Firestore write |
|---------|----------------------------------|----------------------|
| PASS_7D 7900→8900 | PASS (`check_price_quote_path.js`) | SKIPPED (no ADC) |
| PASS_30D 19900→21900 | PASS | SKIPPED |
| PASS_90D 49900→52900 | PASS | SKIPPED |
| LIFETIME 129000→125000 | PASS | SKIPPED |

Offline: `node scripts/check_price_sot.js` PASS  
Live read: `getPublicCatalog` policy prices PASS

---

## HARDCODED PRICES REMAINING

Seed / FALLBACK / `config.priceValueKr` only — **not** applied when Firestore product exists.

---

## FILES CHANGED

- `assets/js/catalog-engine.js` (prior)
- `assets/js/pricing-admin.js` — seed no price rewrite; save sync regions; read-back
- `assets/js/pass-catalog.js` — `cacheSource` / fallback log
- `assets/js/pricing.js` — fallback logs; invalidate helper
- `assets/js/app.js` — re-render after catalog; await refresh; cache-bust imports
- `functions/catalogEngine.js` (prior)
- `functions/index.js` — PRICE_INVALID; listPriceKrw SoT vs stale region sale
- `MidiAI/firebase/functions/catalog_store.py` (prior)
- `purchase.html`, `en/ja/purchase.html`, `admin.html` — `?v=price-sot-1`
- `scripts/check_price_sot.js`, `scripts/check_price_quote_path.js`
- `scripts/check_pass_policy_prices.py`

---

## REMAINING RISKS

1. **Production deploy** of Hosting + Node functions (+ Python if not yet) required before live Admin edits reflect on site/quote.
2. **Live E2E write** not run here — run Admin 8900/21900/52900/125000 → reload → purchase → quote, then restore policy prices after deploy.
3. Existing Firestore docs with `listPriceKrw` ≠ `regions.KR` are healed on next Admin save; until then quote prefers `listPriceKrw`.
