# MidiAI Studio Homepage V21 - PayPal + Firebase Functions

## 추가된 기능
- 구매 페이지 PayPal 버튼 연동
- Google 로그인된 UID 기준 결제 진행
- Firebase Functions 기본 구조 추가
- PayPal 주문 생성: `createPayPalOrder`
- PayPal 결제 캡처/검증: `capturePayPalOrder`
- 결제 성공 시 Firestore 자동 저장
  - `orders/{orderId}` 생성/완료 처리
  - `licenses/{uid}` 자동 지급
- PayPal Webhook 기본 구조 추가
  - 환불/취소 이벤트 수신 시 라이선스 회수 구조 포함

## 홈페이지 설정
`assets/js/config.js`에서 아래 값을 수정하세요.

```js
paypalClientId: "PAYPAL_LIVE_CLIENT_ID",
functionsBaseUrl: "https://us-central1-midiaistudio.cloudfunctions.net",
currency: "KRW",
priceValue: "90000",
plan: "lifetime"
```

> Client Secret은 절대 홈페이지에 넣지 마세요.

## Firebase Functions 배포 준비
`functions/.env.example`을 참고해서 Firebase Functions 환경변수를 설정하세요.

필수 값:

```bash
PAYPAL_ENV=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_PRICE_VALUE=90000
PAYPAL_CURRENCY=KRW
PAYPAL_PLAN=lifetime
APP_ORIGIN=https://midiaistudio.com
```

Webhook까지 연결한 뒤 추가:

```bash
PAYPAL_WEBHOOK_ID=...
```

## 배포 후 PayPal Webhook URL
Functions 배포 후 PayPal Live Webhook에 아래 URL을 등록하세요.

```text
https://us-central1-midiaistudio.cloudfunctions.net/paypalWebhook
```

권장 이벤트:

```text
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.REFUNDED
PAYMENT.CAPTURE.REVERSED
PAYMENT.CAPTURE.DENIED
CHECKOUT.ORDER.APPROVED
```

## 동작 흐름
1. 사용자가 Google 로그인
2. 구매 페이지에서 PayPal 결제
3. 홈페이지가 `createPayPalOrder` 호출
4. PayPal 결제창 표시
5. 승인 후 `capturePayPalOrder` 호출
6. 서버가 PayPal API로 결제 검증
7. `orders` 저장
8. `licenses/{uid}` 자동 지급

## 주의
- 지금 단계는 V21 기본 구조입니다.
- 실제 Live 결제 전 Sandbox로 먼저 테스트하세요.
- PayPal Client ID는 공개되어도 되는 값이지만, Client Secret은 Firebase Functions 환경변수로만 관리하세요.
