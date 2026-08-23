# Pass / Purchase Policy Cleanup — Completion Report

Date: 2026-08-23  
Repo: `C:\GitHub\midiaistudio-site`

## Summary

기간제 Full Pass 중심으로 Admin·Purchase UI / seed / fallback 가격을 정리했다.  
Credit 엔진·ledger·주문 기록은 유지하고, `CREDIT_5/30/100`만 판매중지(`paused`)로 전환했다.

## Changed

| Area | Change |
|------|--------|
| `catalog-engine.js` | CREDIT_* seed `status: paused`; Lifetime name → Lifetime Full; prices 7900/19900/49900/129000 |
| `functions/catalogEngine.js` | Lifetime Full naming; listPriceKrw 129000 |
| `credit-catalog.js` | Fallback packs `status: paused` |
| `config.js` | `CREDIT_PURCHASE_ENABLED: false`; Lifetime display 129000 |
| `pricing.js` | FALLBACK KR list/sale **129000** (was 130000) |
| `pricing-admin.js` | Pass list: `N일 Full · 가격`; Credit only for `credit_pack`; ensureSeed pauses active CREDIT_*; Lifetime 130000→129000 rewrite kept |
| `app.js` `pointCopy` | Credit 판매 문구 제거; Pass 공통: 변환 횟수 제한 없음 / Full 기능 / 자동결제 없음; Lifetime Full; trial → Full 이용권 구매 후…; Lifetime 차단 문구 유지 |
| `purchase.html` (+ en/ja) | Hero/meta/schema/bank 129000; Credit 판매 카피 제거 |
| `account.html` | CTA → Full 이용권 구매 (credits query 제거) |
| `admin-preview.js` | Pass rows + Credit 중지 + Lifetime 129000 |
| scripts | `check_pass_policy_prices.py`; smoke/price-source 129000 |

## Price consistency

| Source | PASS_7D | PASS_30D | PASS_90D | LIFETIME |
|--------|---------|----------|----------|----------|
| Browser seed | 7900 | 19900 | 49900 | 129000 |
| Functions seed | 7900 | 19900 | 49900 | 129000 |
| `config.js` | — | — | — | 129000 |
| Live `getPublicCatalog` | 7900 | 19900 | 49900 | **129000** |

Local check: **PASS**  
Live prices: **PASS**  
Hydrate 130000→129000: still present as safety net (WARN only; SoT is seed/Firestore 129000)

## LIVE FAIL (action required)

Firestore `products/CREDIT_*` are still **`status: active`** on production (`getPublicCatalog`).

Client already gates sales (`CREDIT_PURCHASE_ENABLED: false` + paused seed/fallback), but server-side pause needs one of:

1. Admin → 상품 가격 관리 페이지 1회 오픈 (`ensureSeed`가 CREDIT_*를 `paused`로 merge), or  
2. Firestore에서 CREDIT_5 / CREDIT_30 / CREDIT_100 → `status: paused` 수동 설정

Orders / ledger / credit engine: **not deleted**.  
Past Lifetime orders at 130000: **not modified**.

## Lifetime purchase gate

Unchanged: Lifetime 로그인 시 PASS 버튼 `추가 구매 불필요`, Lifetime 카드 `현재 이용 중`.  
Trial / 기간권: `purchaseActionsLocked() === false` → PASS 구매 버튼 정상 노출.

## Deploy

Hosting/Functions **not deployed** in this pass (awaiting explicit request).  
After hosting deploy, hard-refresh purchase/admin (`?v=pass-policy-1`).
