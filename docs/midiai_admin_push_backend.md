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

메뉴: **운영 > 알림 전송 설정** (`#view=push`)

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

전체 Functions deploy 금지.

---

## Android next step

Cursor에서 `C:\GitHub\MidiAI-Admin-Android` 를 연 뒤:

1. Firebase Console Android 앱 `com.midiaistudio.admin` 등록 + 실제 `google-services.json`
2. 이후 API마다 `deviceId` + `deviceSecret` 전송 (FCM token만으로 인증하지 말 것)
3. `deviceSecret`을 Android Keystore 기반 secure storage에 보관
4. 최초 등록 응답의 `deviceSecret`을 놓치면 재발급되지 않음 — 즉시 저장
5. Debug APK 재빌드 후 실기기 등록 → 웹 승인 → Push 테스트
