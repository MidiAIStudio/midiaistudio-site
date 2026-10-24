# 결제 교차검증 + 기간제 만료일 복구 보고

- 프로젝트: midiaistudio
- 생성: 2026-10-24
- 데이터 경로: `orders`, `adminAuditLogs`, `licenses` (+ readTime/캐시 스냅샷)
- 관리자 UI: `assets/js/app.js` — CRM 결제 메뉴는 `collection(db,'orders')` 실시간 구독

## 1. 웹 결제 / 수동 지급 경로

| 구분 | Firestore | 비고 |
|---|---|---|
| 웹/수기 결제 | `orders/{orderId}` | KakaoPay·PayPal·`provider=manual` / `bank_transfer` / `source=admin_manual` |
| 크레딧 구매 | `creditPurchases` | 라이선스 복구 대상 아님 |
| 관리자 라이선스 감사 | `adminAuditLogs` | `PASS_ADMIN_GRANTED`, 수기 결제, 일괄 지급 등 |
| 라이선스 본체 | `licenses/{uid}` | 복구 시 관련 필드만 patch |

수동 지급 = 무료가 아님. `PASS_ADMIN_GRANTED` / `method=manual` / 계좌입금 `orders` 를 유료 근거로 인정.

## 2. 124명 교차검증 결과

| 재분류 버킷 | 인원 | 처리 |
|---|---|---|
| A_LIFETIME | 15 | 기존 복구 유지 (변경 없음) |
| B_TRIAL_OK | 101 | 3일권 유지 |
| C_PERIOD | 7 | 사고 직전 만료일로 복구 **완료** |
| B_RECLASS_PAID_PERIOD | 1 | 유료 30일 **이미 만료** 후 trial 상태였음 → 현재 3일권 **유지** |
| REVIEW_CONFLICT | 0 | — |

### 결제 통계 (사고 대상 124명 기준)

| 항목 | 수 |
|---|---|
| 웹 결제 Lifetime 회원 | 7 |
| 수동 지급 Lifetime 회원 | 7 |
| 웹 결제 기간제 회원 | 4 |
| 수동 지급 기간제 주문 | 0 (수동은 `PASS_ADMIN_GRANTED` 감사로 확인, orders 미생성 3명) |
| 유료 라이선스 주문 보유 | 18 |
| B(102) 중 추가 유료 확인 | 1명 (`xuxrixn@gmail.com`) — 만료분, 복구 불필요 |
| 충돌/불명 | 0 |

## 3. 기간제 복구 (C 7명) — Apply 완료

Dry-run: would_restore **7**, keep_current **1**  
Apply: restored **7/7**, 재실행 already_ok **7**

| 이메일 | 근거 | 복구 만료 |
|---|---|---|
| sogksxp@gmail.com | KakaoPay PASS_30D | 2026-10-28 |
| a01031981217@gmail.com | KakaoPay PASS_30D | 2026-11-20 |
| pms7376123@gmail.com | KakaoPay PASS_30D | 2026-11-10 |
| pbm724@gmail.com | PASS_ADMIN_GRANTED (수동) | 2026-11-24 |
| cijusg0078@gmail.com | PASS_ADMIN_GRANTED (수동) | 2026-11-24 |
| pure32karen@gmail.com | PASS_ADMIN_GRANTED (수동) | 2026-11-24 |
| jiangduojiangduo@qq.com | welcome PASS_3D 스냅샷 | 2026-10-27 13:03Z |

### 유지 (복구 안 함)

| 이메일 | 사유 |
|---|---|
| xuxrixn@gmail.com | 2026-09-18 PASS_30D 구매 있으나 사고 직전 라이선스는 이미 `trial` (만료 경과). 현재 일괄 3일권 유지 |

## 4. 변경하지 않은 것

- Lifetime 15명
- Trial→3일 정상 101명 (+ xuxrixn 유지)
- 크레딧 / HWID / orders 문서

## 5. 산출물

- `payment_crosscheck_all.json` / `payment_crosscheck_summary.json`
- `period_restore_dry_run_*.json` / `period_restore_apply_*.json`
- `dev/scripts/crosscheck_payment_license_incident_20261024.mjs`
- `dev/scripts/restore_period_bulk_incident_20261024.mjs`
