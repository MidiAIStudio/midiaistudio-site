# MidiAI Admin Push — Web / Firebase Backend Contract

이 문서는 `C:\GitHub\midiaistudio-site`에 구현된 관리자 FCM Backend와 Android 앱 계약을 기록한다.

Android 저장소는 이 프로젝트 안에 복사하지 않는다.

`C:\GitHub\MidiAI-Admin-Android`

비밀번호, Secret 원문, FCM token 원문은 이 문서에 기록하지 않는다.

---

## Firebase

| 항목 | 값 |
|---|---|
| Firebase Project | `midiaistudio` |
| Functions region | `us-central1` |
| HTTPS base URL | `https://us-central1-midiaistudio.cloudfunctions.net` |
| Android package | `com.midiaistudio.admin` |
| App name | MidiAI Admin |
| Functions runtime | Node.js 20 |
| Codebase | `web` (`firebase.json`) |

모두 `POST`, `Content-Type: application/json`.

성공: `{ "ok": true, ... }`  
실패: HTTP 4xx/5xx + `{ "ok": false, "message": "..." }`

| status | 의미 |
|---|---|
| 400 | validation |
| 403 | deviceSecret 불일치 / 권한 없음 |
| 404 | 기기 없음 |
| 405 | POST 아님 |
| 429 | rate limit |
| 500 | 서버 오류. token/secret은 로그에 남기지 않음 |

---

## Device Registration

### `requestAdminDeviceRegistration`

최초 요청:

```json
{
  "deviceId": "<stable device id>",
  "fcmToken": "<raw FCM registration token>",
  "deviceName": "Galaxy S25 Ultra",
  "appVersion": "1.0.0",
  "platform": "android"
}
```

최초 성공 응답:

```json
{
  "ok": true,
  "status": "pending",
  "enabled": false,
  "role": "staff",
  "deviceSecret": "<returned only once>"
}
```

`deviceSecret` 발급 규칙:

- cryptographically secure random (32 bytes, base64url)
- Firestore에는 `deviceSecretHash` (SHA-256 hex)만 저장
- raw `deviceSecret`은 **신규 문서 생성 시 응답에서 1회만** 반환
- 이후 어떤 API도 raw secret을 다시 주지 않는다
- 재요청으로 secret을 무제한 재발급하지 않는다

동일 `deviceId` 재요청:

| 현재 status | 동작 |
|---|---|
| 없음 (신규) | `pending` 생성, secret 1회 발급, raw FCM token + tokenHash 저장 |
| `pending` | token 갱신. secret 재발급 없음 |
| `rejected` | 다시 `pending`. **기존 secret hash 유지** (rotation 없음) |
| `approved` / `disabled` | **기존 `deviceSecret` 필수**. token만 갱신. status/role/enabled 불변. secret 재발급 없음 |
| `revoked` | 재등록으로 복구 불가. token/secret 변경 없음. 웹 관리자만 복구 |

`approved`/`disabled`에서 secret 없이 재등록하면 **403**.

응답/로그/UI에 raw FCM token, tokenHash, deviceSecretHash를 넣지 않는다.

---

## Device Authentication

Firebase Auth를 Android device API에 쓰지 않는다.  
`requireAdmin`도 Android API에 넣지 않는다.

장기 인증은 **FCM token이 아니라 `deviceSecret`** 이다.

| Function | deviceId | deviceSecret | fcmToken | 비고 |
|---|---|---|---|---|
| `requestAdminDeviceRegistration` | 필수 | 신규 불필요. approved/disabled 재요청 시 필수 | 필수 (저장용, 인증 아님) | secret 재발급 없음 |
| `getAdminDeviceStatus` | 필수 | 문서가 있으면 **필수** | 인증에 사용하지 않음 | 미등록이면 secret 없이 `unregistered` |
| `updateAdminDeviceToken` | 필수 | **필수** | 필수 (새 raw token) | status/role/enabled 불변 |
| `updateAdminDeviceSettings` | 필수 | **필수** | 없음 | category boolean whitelist만 |
| `sendAdminDeviceTestPush` | 필수 | **필수** | 없음 | approved+enabled만 |
| `unregisterAdminDevice` | 필수 | **필수** | 없음 | `revoked` |
| `getAdminMobileDashboard` | 필수 | **필수** | 없음 | approved + enabled only |
| `getAdminPaymentDetail` | 필수 | **필수** | 없음 | approved + enabled only. `paymentId` 필수 |
| `getAdminSalesReport` | 필수 | **필수** | 없음 | approved + enabled only |
| `getAdminSettlementDashboard` | 필수 | **필수** | 없음 | approved + enabled only. 원장 기반 예상 정산 |

서버 비교: `SHA-256(deviceSecret)` 와 `deviceSecretHash` 를 timing-safe 비교.

잘못된 secret → **403**.  
FCM token만 보내서는 인증되지 않는다.

웹 관리자 `manageAdminPush`만 Firebase ID token + `users/{uid}.role` ∈ `admin|developer|staff`.

---

## Token Storage

### Backend (`adminDevices/{deviceId}`)

```
token:     <raw FCM registration token>   ← Admin SDK sendEach 전용
tokenHash: <sha256(token) hex>            ← dedup / audit
```

Firestore rules: `adminDevices` client `read, write: if false`.

raw token은:

- 관리자 UI 표시 금지
- API response 반환 금지
- log 출력 금지
- browser client 접근 금지
- Firebase Functions Admin SDK에서만 사용

`tokenHash`를 `messaging.sendEach`에 넣지 않는다. 실제 FCM registration token만 전송한다.

### Android (다음 workspace에서 구현)

저장해야 할 값:

- `deviceId`
- `deviceSecret`
- `registrationCompleted`

`deviceSecret`은 DataStore plaintext보다 **Android Keystore 기반 secure storage**가 적절하다.

FCM token은 기기의 FCM SDK가 관리한다. 서버 인증 credential로 쓰지 않는다.

---

## Function Contract

Base: `https://us-central1-midiaistudio.cloudfunctions.net/<name>`

### `requestAdminDeviceRegistration`

요청: 위 Device Registration 참고.

### `getAdminDeviceStatus`

요청:

```json
{
  "deviceId": "...",
  "deviceSecret": "..."
}
```

응답:

```json
{
  "ok": true,
  "status": "approved",
  "enabled": true,
  "role": "owner",
  "label": "산타님 Galaxy",
  "paymentEnabled": true,
  "inquiryEnabled": true,
  "refundEnabled": true,
  "criticalEnabled": true
}
```

`deviceSecret` / `token` 반환 없음.  
앱 시작 / foreground 복귀 시 1회. polling 없음.

### `updateAdminDeviceToken`

FCM `onNewToken()`:

```json
{
  "deviceId": "...",
  "deviceSecret": "...",
  "fcmToken": "<new raw token>",
  "appVersion": "1.0.1"
}
```

응답: `{ "ok": true }`

저장: `token`, `tokenHash`, `tokenUpdatedAt`.  
`status` / `role` / `enabled` 변경 없음.  
`revoked`는 token만 바꿔도 활성화되지 않음.  
예외: `approved` + `disabledReason=invalid_token`이면 새 token으로 `enabled=true` 복구.

### `updateAdminDeviceSettings`

```json
{
  "deviceId": "...",
  "deviceSecret": "...",
  "paymentEnabled": true,
  "inquiryEnabled": true,
  "refundEnabled": true,
  "criticalEnabled": true
}
```

서버 whitelist: 위 4개 boolean만. `status` / `role` / `enabled` 무시. 승인된 기기만.

### `sendAdminDeviceTestPush`

```json
{
  "deviceId": "...",
  "deviceSecret": "..."
}
```

실제 Admin Messaging. title `🔔 MidiAI Admin 테스트`. `eventType=test`.  
approved+enabled가 아니면 403.

### `unregisterAdminDevice`

```json
{
  "deviceId": "...",
  "deviceSecret": "..."
}
```

hard delete 없음. `status=revoked`, `enabled=false`.

---

## Mobile Dashboard

Android `HttpAdminApi` POST:

`https://us-central1-midiaistudio.cloudfunctions.net/getAdminMobileDashboard`

승인된 활성 기기만 (`status == approved` AND `enabled == true`).  
revoked / disabled / 잘못된 `deviceSecret` → **403**. FCM token은 인증이 아니다.

요청:

```json
{
  "deviceId": "...",
  "deviceSecret": "..."
}
```

성공 (`HTTP 200`):

```json
{
  "ok": true,
  "today": {
    "revenue": 168800,
    "payments": 3,
    "refundAmount": 0,
    "refunds": 0,
    "inquiries": 2,
    "critical": 0
  },
  "month": {
    "revenue": 1284600,
    "payments": 27,
    "refundAmount": 19900,
    "refunds": 1
  },
  "currency": "KRW",
  "generatedAt": "2026-09-08T00:42:00.000Z",
  "netRevenue": {
    "today": 168800,
    "month": 1264700
  },
  "recentPayments": [],
  "recentInquiries": [],
  "recentCritical": []
}
```

필드 계약 (Android `DashboardPayloads` canonical):

| 영역 | 필드 |
|---|---|
| today | `revenue`, `payments`, `refundAmount`, `refunds`, `inquiries`, `critical` |
| month | `revenue`, `payments`, `refundAmount`, `refunds` (inquiries/critical 없음) |
| 시각 | `generatedAt` ISO-8601. today/month는 **Asia/Seoul** 캘린더 |
| 목록 | 기본 20, 최대 50. summary + recent를 **한 요청**에 반환 |

### Revenue Definition

- **Source of truth:** Firestore `orders` (PortOne Lifetime/PASS + PayPal license/credit).
- **추가 소스:** `creditPurchases` / `pointPurchases` — 동일 `paymentId` / `paypalOrderId`가 `orders`에 있으면 **제외** (PayPal credit 이중집계 방지).
- `licenses` / `entitlementGrants` / `creditLedger*` 는 매출로 세지 않는다.
- **revenue** = 기간 내 **성공 결제 총액 (gross)**. 상태 `completed` / `paid` / `verified` / `license_issued` / `credited` / 이후 환불된 `refunded` / `partially_refunded`.
- **제외:** `pending`, `failed`, `created`, `duplicate_*`, `environment=test|sandbox`.
- **refundAmount / refunds** 는 별도. `netRevenue = revenue - refundAmount` (참고 필드). 환불을 revenue에서 다시 빼지 않는다.
- 대시보드 `currency` 는 `KRW`. USD(PayPal)는 주문의 `effectivePriceKrw` 또는 `fxRate`로 KRW 환산.
- 이메일만 마스킹해서 반환 (`kan***@gmail.com`). 카드번호, token, secret, stack, FCM, `deviceSecret` 없음.

### KST Boundaries

`Intl` + `Asia/Seoul` (수동 +9/-9 없음). 저장된 Firestore timestamp는 변경하지 않는다.

- today: 오늘 00:00 KST 포함 → 다음날 00:00 KST 미만
- month: 해당 월 1일 00:00 KST 포함 → 다음 달 1일 00:00 KST 미만

예: `2026-09-08 00:34 KST` 는 9/8 today에 포함. `2026-09-07 23:59 KST` 는 제외.

---

## Recent Payments

`recentPayments[]` (별칭 `payments` 도 Android가 읽음):

```json
{
  "paymentId": "pay_1",
  "provider": "portone",
  "product": "30일 PASS",
  "amount": 19900,
  "currency": "KRW",
  "status": "completed",
  "emailMasked": "kan***@gmail.com",
  "paidAt": "2026-09-08T00:42:00.000Z",
  "refundedAmount": 0,
  "adminUrl": "https://midiaistudio.com/admin.html#view=crm&crm=orders"
}
```

`paidAt` = `completedAt` || `issuedAt` || `verifiedAt` || `paidAt` || `createdAt`.  
정렬: `paidAt` 최신순.

---

## Payment Detail

`POST getAdminPaymentDetail`

```json
{
  "deviceId": "...",
  "deviceSecret": "...",
  "paymentId": "pay_1"
}
```

성공 — top-level + `payment` 중첩 (Android 둘 다 파싱):

```json
{
  "ok": true,
  "payment": {
    "paymentId": "pay_1",
    "product": "Lifetime",
    "amount": 129000,
    "currency": "KRW",
    "status": "completed",
    "provider": "portone",
    "emailMasked": "abc***@gmail.com",
    "paidAt": "2026-09-07T14:18:00.000Z",
    "refundStatus": "none",
    "refundedAmount": 0,
    "adminUrl": "https://midiaistudio.com/admin.html#view=crm&crm=orders"
  },
  "paymentId": "pay_1",
  "product": "Lifetime",
  "amount": 129000,
  "currency": "KRW",
  "status": "completed",
  "provider": "portone",
  "emailMasked": "abc***@gmail.com",
  "paidAt": "2026-09-07T14:18:00.000Z",
  "refundStatus": "none",
  "refundedAmount": 0,
  "adminUrl": "https://midiaistudio.com/admin.html#view=crm&crm=orders"
}
```

`refundStatus`: `none` | `partial` | `refunded`.  
lookup: `orders/{id}` → `creditPurchases/{id}` → `paymentId` / `paypalOrderId` / `paypalCaptureId`.  
없으면 **404**. 승인 기기 아니면 **403**.

---

## Recent Inquiries

상담사 연결(`waiting_human` / `humanRequestedAt`) 티켓만. 컬렉션: `supportTickets`.

```json
{
  "inquiryId": "inq_1",
  "title": "설치·업데이트·실행 오류",
  "category": "install",
  "emailMasked": "kan***@gmail.com",
  "status": "waiting_human",
  "createdAt": "2026-09-08T00:34:00.000Z",
  "adminUrl": "https://midiaistudio.com/admin.html#view=support"
}
```

today `inquiries` = 오늘 KST에 `humanRequestedAt`(없으면 `createdAt`)이 있는 상담사 연결 건수.

---

## Recent Critical Events

컬렉션: `adminPushLogs` (`type == critical`).

```json
{
  "eventId": "log_1",
  "title": "지급 실패",
  "summary": "PASS 지급 실패",
  "timestamp": "2026-09-08T00:15:00.000Z",
  "adminUrl": "https://midiaistudio.com/admin.html#view=logs"
}
```

Android는 `summary` / `body` / `message` 중 하나를 쓰고 180자로 자른다.

---

## Payments V2

모바일 결제 한 건은 **하나의 canonical payment**이다. 승인 후 환불되어도 목록에 두 줄로 나누지 않는다.

### Canonical status

| status | 표시 |
|---|---|
| `paid` | 결제완료 |
| `partially_refunded` | 부분환불 |
| `refunded` | 전액환불 |
| `cancelled` | 취소 |
| `failed` | 결제실패 |
| `pending` | 처리중 |

원장 `completed` / `paid` / `verified` / `license_issued` / `credited` → `paid`.  
`failed` / `pending` / `created` 는 운영 매출 목록 기본에서 제외.

### Payment item

```json
{
  "paymentId": "pay_a",
  "product": "평생 이용권",
  "provider": "kakaopay",
  "status": "refunded",
  "grossAmount": 130000,
  "refundAmount": 130000,
  "netAmount": 0,
  "amount": 130000,
  "currency": "KRW",
  "emailMasked": "abc***@gmail.com",
  "paidAt": "2026-09-01T05:46:00.000Z",
  "refundedAt": "2026-09-02T02:00:00.000Z",
  "refundedAmount": 130000,
  "adminUrl": "https://midiaistudio.com/admin.html#view=crm&crm=orders"
}
```

`amount` / `refundedAmount` 는 기존 Android 호환 alias (`grossAmount` / `refundAmount`).

상품 표시 매퍼 (원장 원문 변경 없음): Lifetime → 평생 이용권, 7일 Full → 7일 PASS, 30일 Full → 30일 PASS, 90일 → 90일 PASS.

`today` / `month` 에 `grossRevenue`, `netRevenue` 를 추가한다. 기존 `revenue` 는 **gross**.

---

## Sales Report

`POST getAdminSalesReport`

```json
{
  "deviceId": "...",
  "deviceSecret": "...",
  "from": "2026-09-01",
  "to": "2026-09-08",
  "status": "paid",
  "limit": 20,
  "cursor": null
}
```

- `from` / `to`: 사용자 캘린더 날짜, **양쪽 inclusive**. 서버는 Asia/Seoul `from 00:00` 이상 ~ `to+1일 00:00` 미만.
- `status`: `paid` (기본) | `refund` (`partially_refunded`/`refunded`/`cancelled`) | `all`
- `limit` 기본 20, 최대 50. `nextCursor` 있으면 [더 보기].

성공:

```json
{
  "ok": true,
  "period": { "from": "2026-09-01", "to": "2026-09-08" },
  "summary": {
    "grossRevenue": 428800,
    "refundAmount": 149900,
    "netRevenue": 278900,
    "paidCount": 7,
    "refundCount": 2,
    "currency": "KRW"
  },
  "status": "paid",
  "payments": [],
  "nextCursor": null
}
```

집계 (목록 필터와 무관하게 summary는 기간 전체):

- **grossRevenue / paidCount** = `paidAt` (`completedAt`…) 가 기간 안인 성공 결제 총액/건수. 이후 환불된 건도 **원 승인액**으로 포함.
- **refundAmount / refundCount** = `refundedAt`/`refundAt`/`cancelledAt`(없으면 `updatedAt`) 가 기간 안인 환불. 8월 결제·9월 환불이면 9월 보고서에 환불만 잡힌다.
- **netRevenue** = grossRevenue − refundAmount. 동일 결제를 두 번 빼지 않는다.

---

## Settlement estimate contract

PortOne PG settlement / payout API는 **사용하지 않는다.** 스크래핑·역공학 없음.

Source of truth: Firestore `orders` (+ credit/point 원장, 기존 canonical payment/refund/cancel 정규화).

계산은 **읽기 시점 투영**이다. 주문 문서에 예상 정산일을 영구 스탬프하지 않는다.

`POST getAdminSettlementDashboard`

```json
{
  "ok": true,
  "settlementDataAvailable": true,
  "isEstimate": true,
  "calculationMethod": "contract_projection",
  "settings": {
    "provider": "kakaopay",
    "settlementType": "business_days",
    "businessDays": 7,
    "feeRatePercent": 3.2,
    "feeVatRatePercent": 10,
    "excludeWeekends": true,
    "excludeKoreanHolidays": true,
    "excludedDates": [],
    "label": "카카오페이"
  },
  "settingsSource": "configured",
  "nextSettlement": {
    "date": "2026-09-15",
    "paymentCount": 2,
    "grossAmount": 260000,
    "fee": 8320,
    "feeVat": 832,
    "expectedSettlementAmount": 250848
  },
  "upcoming": [
    {
      "date": "2026-09-15",
      "status": "UPCOMING",
      "label": "예상 정산",
      "paymentCount": 2,
      "grossAmount": 260000,
      "fee": 8320,
      "feeVat": 832,
      "expectedSettlementAmount": 250848,
      "isEstimate": true,
      "payments": [
        {
          "paymentId": "pay_a",
          "product": "평생 이용권",
          "grossAmount": 130000,
          "settlementBase": 130000,
          "fee": 4160,
          "feeVat": 416,
          "expectedSettlementAmount": 125424,
          "estimateStatus": "UPCOMING",
          "label": "예상 정산",
          "expectedSettlementDate": "2026-09-15",
          "isEstimate": true
        }
      ]
    }
  ],
  "pastExpected": [],
  "adjustments": [],
  "generatedAt": "2026-09-08T00:34:00.000Z"
}
```

`settingsSource`: `configured` | `default` (문서 없으면 서버 기본 D+7 / 3.2% / VAT 10% / 주말 제외).

### Calculation

- Timezone: Asia/Seoul. `addBusinessDaysKst`는 **paidAt의 KST 달력일 다음 영업일부터** 센다.
- 예: 2026-09-05(토) D+7 → 09/07=1 … 09/15=7 → `expectedSettlementDate = 2026-09-15`.
- 주말/한국 공휴일/`excludedDates`는 영업일이 아니다. 공휴일 소스: `functions/koreanHolidays.js` 정적 목록 (관공서의 공휴일에 관한 규정, 2024–2028). **런타임 외부 공휴일 API 없음.**
- KRW 정수: `fee = round(base * feeRate)`, `feeVat = round(fee * vatRate)`.
- 예: `130000 * 3.2% = 4160`, VAT `416`, 예상 정산 `125424`.
- 동일 예상일 그룹: 두 건 130000 → `260000 / 8320 / 832 / 250848`.
- `feeRate`는 `effectiveFrom` + `rateHistory`로 paidAt 기준 해석. 이후 요율 변경이 과거 결제에 소급되지 않는다.

### Refund rules

| 상황 | settlementBase | status / 표시 |
|---|---|---|
| 정상 결제 | `grossAmount` | `UPCOMING` 예상 정산 / `PAST_EXPECTED` 예상일 경과 |
| 예상일 **이전** 전액 환불·취소 | `0` | `CANCELLED_BEFORE_SETTLEMENT` 정산 제외 예상 |
| 예상일 **이전** 부분 환불 | `grossAmount - refundAmount` | 위와 동일 일정 그룹 |
| 예상일 **이후** 환불 | 원래 예상 정산 유지 | `ADJUSTMENT` 정산 조정 예상. 회수일 추정 금지. UI: `PG 정산 반영일 확인 필요` |

서버는 실제 입금을 모르므로 **「정산 완료」를 자동 표시하지 않는다.** `isEstimate`는 항상 true.

failed / pending / test 는 제외. 매출 리포트의 `grossRevenue` / `netRevenue` 와 `expectedSettlementAmount` 를 섞지 않는다.

### Dashboard / payment detail

`getAdminMobileDashboard.settlement.nextSettlement` 는 **upcoming 그룹이 있을 때만** 넣는다. 없으면 `null` (홈 빈 카드 금지).

`getAdminPaymentDetail` 에 `estimatedSettlement` 블록을 추가한다.

### Admin settings

Firestore `adminSettlementSettings/default`. client write 금지 (Functions / `manageAdminSettlementSettings` + `requireAdmin` 만). Android는 읽기만.

웹 관리자: **운영 > 정산 설정** (`#view=settlement`).

### `manageAdminSettlementSettings`

`requireAdmin`. Android 인증 불가.

```json
{ "action": "get" }
{ "action": "save", "businessDays": 7, "feeRatePercent": 3.2, "feeVatRatePercent": 10, "excludeWeekends": true, "excludeKoreanHolidays": true, "excludedDates": [] }
```

---

## Device status

```
pending    승인 대기. 운영 Push 금지
approved   enabled==true 일 때만 운영 Push
disabled   일시 중지
revoked    권한 회수. 재등록 복구 불가
rejected   거절. 재요청 시 pending, secret 유지
```

운영 Push 대상:

`status == approved` AND `enabled == true` AND raw token 존재 AND 전역 category ON AND 기기 category ON

---

## Firestore

Admin SDK만 write.

### `adminDevices/{deviceId}`

| field | notes |
|---|---|
| token | **raw FCM token**. server-only |
| tokenHash | sha256(token) hex. sendEach에 사용 금지 |
| deviceSecretHash | sha256(deviceSecret). 원문 저장 금지 |
| platform | `android` |
| status | pending \| approved \| disabled \| revoked \| rejected |
| enabled | bool |
| role | owner \| staff |
| label, deviceName, appVersion | |
| paymentEnabled, inquiryEnabled, refundEnabled, criticalEnabled | |
| requestedAt, approvedAt, rejectedAt, disabledAt, revokedAt | serverTimestamp |
| lastSeenAt, tokenUpdatedAt, createdAt, updatedAt | serverTimestamp |
| tokenInvalid, disabledReason | invalid token cleanup |

Invalid FCM 응답 시:

```
token = ""
tokenHash = ""
tokenInvalid = true
enabled = false
disabledReason = invalid_token
```

문서 자체는 삭제하지 않는다.

### `adminNotificationSettings/default`

`paymentEnabled`, `inquiryEnabled`, `refundEnabled`, `criticalEnabled`

### `adminSettlementSettings/default`

`enabled`, `provider`, `settlementType`, `businessDays`, `feeRatePercent`, `feeVatRatePercent`, `excludeWeekends`, `excludeKoreanHolidays`, `excludedDates`, `label`, `notes`, `effectiveFrom`, `rateHistory`, `updatedAt`, `updatedBy`

client `read, write: if false`. Admin SDK / `manageAdminSettlementSettings` only.

### `adminPushLogs/{autoId}`

`type`, `attempted`, `success`, `failed`, `title`(80자), `createdAt`. body/token 장기 저장 없음.

---

## FCM payload

`messaging.sendEach`에 **raw token**만 전달.

```
notification.title / body
data.eventType  payment | inquiry | refund | critical | system | test
data.entityId
data.adminUrl
data.title
data.body
android.priority = high
android.notification.channelId = payment | inquiry | refund | critical | system
```

Admin URL:

| type | adminUrl |
|---|---|
| payment / refund | `https://midiaistudio.com/admin.html#view=crm&crm=orders` |
| inquiry | `https://midiaistudio.com/admin.html#view=tickets` |
| critical | `https://midiaistudio.com/admin.html#view=logs` |
| system / test | `https://midiaistudio.com/admin.html#view=push` |

---

## Web admin

`manageAdminPush` (`requireAdmin`). action:

`overview` | `updateGlobal` | `testAll` | `approve` | `reject` | `disable` | `enable` | `revoke` | `updateDevice` | `testDevice`

메뉴: **운영 > 알림 전송 설정** (`#view=push`), **운영 > 정산 설정** (`#view=settlement`)

---

## Event integration

기존 결제/PASS/문의/환불 로직은 rewrite하지 않음. FCM은 성공 이후 try/catch 격리. Kakao 유지.

| type | 연결 |
|---|---|
| payment | 라이선스 지급 완료 / credit grant 성공 후 |
| inquiry | 상담사 연결(`waiting_human`) 이후 |
| refund | PortOne 실제 취소 성공 / PayPal refund webhook |
| critical | PASS/Lifetime 지급 실패, 중복 자동환불 실패, 환불 후 라이선스 재검토 |

---

## Named deploy

```
firebase deploy --only functions:web:requestAdminDeviceRegistration,functions:web:getAdminDeviceStatus,functions:web:updateAdminDeviceToken,functions:web:updateAdminDeviceSettings,functions:web:sendAdminDeviceTestPush,functions:web:unregisterAdminDevice,functions:web:manageAdminPush
```

Mobile dashboard + settlement estimate (named only):

```
firebase deploy --only functions:web:getAdminMobileDashboard,functions:web:getAdminPaymentDetail,functions:web:getAdminSalesReport,functions:web:getAdminSettlementDashboard,functions:web:manageAdminSettlementSettings
```

`assertDevice` secret 검사 수정을 기존 기기 API에 반영할 때:

```
firebase deploy --only functions:web:updateAdminDeviceToken,functions:web:updateAdminDeviceSettings,functions:web:sendAdminDeviceTestPush,functions:web:unregisterAdminDevice
```

전체 Functions deploy 금지.

---

## Android next step

Cursor에서 `C:\GitHub\MidiAI-Admin-Android` 를 연 뒤:

1. Firebase Console Android 앱 `com.midiaistudio.admin` 등록 + 실제 `google-services.json`
2. 이후 API마다 `deviceId` + `deviceSecret` 전송 (FCM token만으로 인증하지 말 것)
3. `deviceSecret`을 Android Keystore 기반 secure storage에 보관
4. 최초 등록 응답의 `deviceSecret`을 놓치면 재발급되지 않음 — 즉시 저장
5. Debug APK 재빌드 후 실기기 등록 → 웹 승인 → Push 테스트
